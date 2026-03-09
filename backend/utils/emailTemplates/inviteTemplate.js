const { buildEmailTemplate } = require('./baseTemplate');

function inviteTemplate({ title, message, ctaUrl, ctaText, translations }) {
  const content = `
    <p style="margin: 0;">${message || translations?.invite?.message || 'Pozvani ste da aktivirate Liftelo račun.'}</p>
  `;
  return buildEmailTemplate({
    title: title || translations?.invite?.subject || 'Pozivnica za račun',
    content,
    ctaText: ctaText || translations?.invite?.cta || 'Postavi lozinku',
    ctaUrl,
    footerText: translations?.footer?.text
  });
}

module.exports = { inviteTemplate };
