const { buildEmailTemplate } = require('./baseTemplate');
const { requireTranslations } = require('./translations');

function passwordResetTemplate({ title, message, ctaUrl, ctaText, translations, language }) {
  const t = requireTranslations(translations, language);
  const content = `
    <p style="margin: 0;">${message || t.passwordReset.message}</p>
  `;
  return buildEmailTemplate({
    title: title || t.passwordReset.subject,
    content,
    ctaText: ctaText || t.passwordReset.cta,
    ctaUrl,
    footerText: t.footer.text,
    language
  });
}

module.exports = { passwordResetTemplate };
