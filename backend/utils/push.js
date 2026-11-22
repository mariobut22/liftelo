const crypto = require('crypto');
const db = require('../db');

/*
 * Web Push (PWA) for in-app notifications.
 *
 * Enabled ONLY when VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (mailto:... or https://...) are all set; otherwise every
 * function here is a harmless no-op and GET /api/push/config says { enabled: false } (the UI hides itself). Keys are never logged.
 * Generate a key pair (not committed anywhere): `node backend/scripts/generate-vapid-keys.js`.
 *
 * Sending is fire-and-forget: pushToUsers() never rejects and never throws into the caller (createNotification, findings), so a
 * push problem can never break the request that created the notification. 404/410 from the push service = the subscription is
 * gone -> its row is deleted.
 */

let webpush = null;
let configured = false;
// replaced in tests (setSender) so nothing ever touches the network
let sender = null;

const isConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
const isPushEnabled = () => isConfigured();
const getPublicKey = () => (isConfigured() ? process.env.VAPID_PUBLIC_KEY : null);

function defaultSender(subscription, payload, options) {
  if (!webpush) webpush = require('web-push');
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    configured = true;
  }
  return webpush.sendNotification(subscription, payload, options);
}

// test hook: setSender(async (subscription, payloadString, options) => {...}); setSender(null) restores the real sender
function setSender(fn) {
  sender = fn || null;
}

const endpointHash = (endpoint) => crypto.createHash('sha256').update(String(endpoint)).digest('hex');

// Push payloads must stay small (limit ~4 KB): short title/body, relative app link.
const clip = (value, max) => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const safeLink = (link) => (typeof link === 'string' && link.startsWith('/') && !link.startsWith('//') ? link : '/dashboard');

/**
 * Sends one push to every subscription of every listed user. Returns { sent, removed, failed } and NEVER rejects.
 * notification: { title, body, link, tag }
 */
async function pushToUsers(userIds, notification) {
  const result = { sent: 0, removed: 0, failed: 0 };
  try {
    if (!isPushEnabled()) return result;
    const ids = [...new Set((userIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    if (!ids.length || !notification?.title) return result;

    const [subs] = await db.query(
      'SELECT id, company_id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (?)',
      [ids]
    );
    if (!subs.length) return result;

    const payload = JSON.stringify({
      title: clip(notification.title, 120),
      body: clip(notification.body, 240),
      url: safeLink(notification.link),
      tag: notification.tag ? clip(notification.tag, 64) : undefined
    });
    const send = sender || defaultSender;

    await Promise.all(subs.map(async (sub) => {
      try {
        await send({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 60 * 60 * 24, urgency: 'normal' });
        result.sent += 1;
      } catch (err) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          try {
            await db.query('DELETE FROM push_subscriptions WHERE id = ? AND company_id = ? LIMIT 1', [sub.id, sub.company_id]);
            result.removed += 1;
          } catch (deleteErr) {
            console.warn('[push] could not remove an expired subscription:', deleteErr.code || deleteErr.message);
          }
        } else {
          result.failed += 1;
          // status only: never the endpoint, keys or payload
          console.warn('[push] send failed, status:', status || err?.code || 'unknown');
        }
      }
    }));
  } catch (err) {
    // e.g. table not migrated yet: push is optional, the caller must not notice
    if (err?.code !== 'ER_NO_SUCH_TABLE') console.warn('[push] skipped:', err?.code || err?.message);
  }
  return result;
}

module.exports = { isPushEnabled, getPublicKey, pushToUsers, setSender, endpointHash };
