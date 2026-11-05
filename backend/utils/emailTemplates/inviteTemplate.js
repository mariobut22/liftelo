const { buildEmailTemplate } = require('./baseTemplate');
const { requireTranslations } = require('./translations');

function inviteTemplate({ title, message, ctaUrl, ctaText, translations, language }) {
  const t = requireTranslations(translations, language);
  const content = `
    <p style="margin: 0;">${message || t.invite.message}</p>
  `;
  return buildEmailTemplate({
    title: title || t.invite.subject,
    content,
    ctaText: ctaText || t.invite.cta,
    ctaUrl,
    footerText: t.footer.text,
    language
  });
}

module.exports = { inviteTemplate };
