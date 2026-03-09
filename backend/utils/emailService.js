const nodemailer = require('nodemailer');
const db = require('../db');
const { notificationTemplate } = require('./emailTemplates/notificationTemplate');
const { inviteTemplate } = require('./emailTemplates/inviteTemplate');
const { passwordResetTemplate } = require('./emailTemplates/passwordResetTemplate');
const { getResolvedLanguage } = require('./i18n/getResolvedLanguage');
const { loadTranslations } = require('./i18n/loadTranslations');

const templates = {
  notification: notificationTemplate,
  invite: inviteTemplate,
  password_reset: passwordResetTemplate
};

const getEmailTranslations = (language = 'en') =>
  loadTranslations({ namespace: 'email', language, defaultLanguage: 'en' });

async function sendEmail({ to, subject, template, data, userId, companyId, language }) {
  try {
    const [[settings]] = await db.query('SELECT * FROM app_settings ORDER BY id ASC LIMIT 1');
    const emailEnabled = Boolean(settings?.email_enabled);
    if (!emailEnabled) {
      return;
    }

    const smtpHost = settings?.smtp_host;
    if (!smtpHost) {
      console.warn('SMTP host missing. Email skipped.');
      return;
    }

    const smtpPort = Number(settings?.smtp_port || 587);
    const smtpUser = settings?.smtp_user || null;
    const smtpPass = settings?.smtp_pass || null;
    const smtpFrom = settings?.smtp_from || 'no-reply@liftelo.local';

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined
    });

    const resolvedLanguage = language || (await getResolvedLanguage({ userId, companyId, fallback: 'en' }));
    const t = getEmailTranslations(resolvedLanguage);

    const builder = templates[template];
    const resolvedSubject = subject || t?.[template]?.subject || t?.notification?.subject || '';
    const html = builder ? builder({
      ...(data || {}),
      translations: t
    }) : (data?.html || '');

    await transporter.sendMail({
      from: smtpFrom,
      to,
      subject: resolvedSubject,
      html
    });
  } catch (err) {
    console.error('Email send failed:', err);
  }
}

module.exports = { sendEmail, getEmailTranslations };
