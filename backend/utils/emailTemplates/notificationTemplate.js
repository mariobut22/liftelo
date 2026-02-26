const { buildEmailTemplate } = require('./baseTemplate');

function notificationTemplate({ title, message, ctaText, ctaUrl }) {
  const content = `
    <p style="margin: 0;">${message || ''}</p>
  `;
  return buildEmailTemplate({
    title,
    content,
    ctaText,
    ctaUrl
  });
}

module.exports = { notificationTemplate };
