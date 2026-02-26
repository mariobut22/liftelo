const nodemailer = require('nodemailer');

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpSecure = process.env.SMTP_SECURE === 'true';
const smtpFrom = process.env.SMTP_FROM || 'no-reply@liftelo.local';

let transporter = null;
if (smtpHost) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined
  });
} else {
  console.warn('SMTP_HOST missing. Email sending disabled.');
}

async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    const err = new Error('SMTP not configured');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  return transporter.sendMail({
    from: smtpFrom,
    to,
    subject,
    html,
    text
  });
}

module.exports = { sendMail };
