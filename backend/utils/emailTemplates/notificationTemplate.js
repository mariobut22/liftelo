const { buildEmailTemplate } = require('./baseTemplate');

function notificationTemplate({ title, message, ctaText, ctaUrl, translations }) {
  const content = `
    <p style="margin: 0;">${message || ''}</p>
  `;
  return buildEmailTemplate({
    title,
    content,
    ctaText: ctaText || translations?.notification?.cta,
    ctaUrl,
    footerText: translations?.footer?.text
  });
}

module.exports = { notificationTemplate };
