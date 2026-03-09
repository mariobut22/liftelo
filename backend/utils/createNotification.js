const db = require('../db');
const { enqueueEmail } = require('./email-outbox');
const { sendEmail } = require('./emailService');

async function createNotification({ userId, type, title, message, link }) {
  if (!userId || !type || !title) {
    return;
  }

  await db.query(
    `INSERT INTO notifications (user_id, type, title, message, link)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, type, title, message || null, link || null]
  );

  const [[row]] = await db.query(
    `SELECT u.email, u.email_notifications_enabled, u.company_id, u.language, c.email_notifications_enabled AS company_email_enabled, c.default_language
     FROM users u
     INNER JOIN companies c ON u.company_id = c.id
     WHERE u.id = ?
     LIMIT 1`,
    [userId]
  );

  if (!row) return;
  if (!row.company_email_enabled || !row.email_notifications_enabled || !row.email) {
    return;
  }

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const resolvedLink = link ? `${appUrl}${link}` : null;
  const language = row.language || row.default_language || 'en';
  const { getEmailTranslations } = require('./emailService');
  const translations = getEmailTranslations(language);
  const openLabel = translations.notification?.cta || 'Open';
  const html = `
    <div style="font-family: Arial, sans-serif;">
      <h3>${title}</h3>
      ${message ? `<p>${message}</p>` : ''}
      ${resolvedLink ? `<p><a href="${resolvedLink}">${openLabel}</a></p>` : ''}
    </div>
  `;

  await enqueueEmail({
    companyId: row.company_id,
    userId,
    toEmail: row.email,
    subject: title,
    html,
    text: message || undefined,
    type: `notification_${type}`
  });

  await sendEmail({
    to: row.email,
    subject: title,
    template: 'notification',
    userId,
    companyId: row.company_id,
    language,
    data: {
      title,
      message: message || '',
      ctaText: resolvedLink ? openLabel : null,
      ctaUrl: resolvedLink || null
    }
  });
}

module.exports = { createNotification };
