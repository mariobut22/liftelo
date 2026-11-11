const { buildEmailTemplate } = require('./baseTemplate');
const { requireTranslations } = require('./translations');

function notificationTemplate({ title, message, ctaText, ctaUrl, translations, language }) {
  const t = requireTranslations(translations, language);
  const content = `
    <p style="margin: 0;">${message || ''}</p>
  `;
  return buildEmailTemplate({
    title,
    content,
    ctaText: ctaText || t.notification.cta,
    ctaUrl,
    footerText: t.footer.text,
    language
  });
}

module.exports = { notificationTemplate };
