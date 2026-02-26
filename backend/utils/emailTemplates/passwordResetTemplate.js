const { buildEmailTemplate } = require('./baseTemplate');

function passwordResetTemplate({ title, message, ctaUrl }) {
  const content = `
    <p style="margin: 0;">${message || 'Kliknite gumb za reset lozinke.'}</p>
  `;
  return buildEmailTemplate({
    title: title || 'Reset lozinke',
    content,
    ctaText: 'Reset lozinke',
    ctaUrl
  });
}

module.exports = { passwordResetTemplate };
