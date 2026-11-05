const db = require('../db');
const { enqueueEmail } = require('./email-outbox');
const { getEmailTranslations } = require('./emailService');
const { notificationTemplate } = require('./emailTemplates/notificationTemplate');
const { getRecipientLanguage } = require('./i18n/getResolvedLanguage');
const { translate } = require('./i18n/translate');

/**
 * Creates an in-app notification (and the matching email) in the RECIPIENT's language:
 * users.language -> companies.default_language -> 'hr'. The text is translated at creation time and
 * stored as plain text (notifications.title / message), so there is no schema change.
 *
 * Preferred: pass translation keys ("notifications:workOrderAssigned.title" or just the key inside
 * the `notifications` namespace) plus `params` for {{placeholders}}:
 *   createNotification({ userId, type, titleKey, messageKey, params, link })
 * `title` / `message` (already translated text) are still accepted for callers that build their own.
 * `ctaKey` overrides the email button label (default: email:notification.cta, invites: email:invite.cta).
 */
async function createNotification({ userId, type, title, message, titleKey, messageKey, params, ctaKey, link }) {
  if (!userId || !type || !(title || titleKey)) {
    return;
  }

  const [[row]] = await db.query(
    `SELECT u.email, u.email_notifications_enabled, u.company_id, u.language,
            c.email_notifications_enabled AS company_email_enabled, c.default_language
     FROM users u
     LEFT JOIN companies c ON u.company_id = c.id
     WHERE u.id = ?
     LIMIT 1`,
    [userId]
  );

  const language = await getRecipientLanguage({
    userId,
    companyId: row?.company_id,
    userLanguage: row?.language,
    companyLanguage: row?.default_language
  });

  const resolvedTitle = titleKey ? translate(titleKey, language, params) : title;
  const resolvedMessage = messageKey ? translate(messageKey, language, params) : message;

  await db.query(
    `INSERT INTO notifications (user_id, type, title, message, link)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, type, resolvedTitle, resolvedMessage || null, link || null]
  );

  if (!row) return;
  if (!row.company_email_enabled || !row.email_notifications_enabled || !row.email) {
    return;
  }

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const resolvedLink = link ? `${appUrl}${link}` : null;
  const translations = getEmailTranslations(language);
  const openLabel = ctaKey
    ? translate(ctaKey, language)
    : (type === 'invite' ? translations.invite.cta : translations.notification.cta);
  // Notification text can contain user-controlled values (e.g. a location name): escape it for the HTML mail
  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const html = notificationTemplate({
    title: esc(resolvedTitle),
    message: esc(resolvedMessage || ''),
    ctaText: resolvedLink ? esc(openLabel) : null,
    ctaUrl: resolvedLink ? esc(resolvedLink) : null,
    translations,
    language
  });

  // One mail per notification: only through the outbox (retry + worker). It used to be queued here AND sent
  // directly through emailService.sendEmail, so recipients got every notification twice.
  await enqueueEmail({
    companyId: row.company_id,
    userId,
    toEmail: row.email,
    subject: resolvedTitle,
    html,
    text: resolvedMessage || undefined,
    type: `notification_${type}`
  });
}

module.exports = { createNotification };
