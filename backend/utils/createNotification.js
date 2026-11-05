const db = require('../db');
const { enqueueEmail } = require('./email-outbox');
const { sendEmail, getEmailTranslations } = require('./emailService');
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
  const html = `
    <div lang="${language}" style="font-family: Arial, sans-serif;">
      <h3>${resolvedTitle}</h3>
      ${resolvedMessage ? `<p>${resolvedMessage}</p>` : ''}
      ${resolvedLink ? `<p><a href="${resolvedLink}">${openLabel}</a></p>` : ''}
    </div>
  `;

  await enqueueEmail({
    companyId: row.company_id,
    userId,
    toEmail: row.email,
    subject: resolvedTitle,
    html,
    text: resolvedMessage || undefined,
    type: `notification_${type}`
  });

  await sendEmail({
    to: row.email,
    subject: resolvedTitle,
    template: 'notification',
    userId,
    companyId: row.company_id,
    language,
    data: {
      title: resolvedTitle,
      message: resolvedMessage || '',
      ctaText: resolvedLink ? openLabel : null,
      ctaUrl: resolvedLink || null
    }
  });
}

module.exports = { createNotification };
