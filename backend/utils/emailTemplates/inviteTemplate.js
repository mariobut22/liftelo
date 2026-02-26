const { buildEmailTemplate } = require('./baseTemplate');

function inviteTemplate({ title, message, ctaUrl }) {
  const content = `
    <p style="margin: 0;">${message || 'Pozvani ste da aktivirate Liftelo račun.'}</p>
  `;
  return buildEmailTemplate({
    title: title || 'Pozivnica za račun',
    content,
    ctaText: 'Postavi lozinku',
    ctaUrl
  });
}

module.exports = { inviteTemplate };
