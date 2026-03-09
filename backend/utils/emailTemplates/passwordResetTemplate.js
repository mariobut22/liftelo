const { buildEmailTemplate } = require('./baseTemplate');

function passwordResetTemplate({ title, message, ctaUrl, ctaText, translations }) {
  const content = `
    <p style="margin: 0;">${message || translations?.passwordReset?.message || 'Kliknite gumb za reset lozinke.'}</p>
  `;
  return buildEmailTemplate({
    title: title || translations?.passwordReset?.subject || 'Reset lozinke',
    content,
    ctaText: ctaText || translations?.passwordReset?.cta || 'Reset lozinke',
    ctaUrl,
    footerText: translations?.footer?.text
  });
}

module.exports = { passwordResetTemplate };
