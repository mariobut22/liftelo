function buildEmailTemplate({ title, content, ctaText, ctaUrl, footerText }) {
  const ctaBlock = ctaText && ctaUrl
    ? `
      <div style="margin-top: 24px; text-align: center;">
        <a href="${ctaUrl}" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600; display: inline-block;">
          ${ctaText}
        </a>
      </div>
    `
    : '';

  return `
  <div style="background: #f8fafc; padding: 32px 16px; font-family: Arial, sans-serif; color: #0f172a;">
    <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);">
      <div style="background: #2563eb; color: #ffffff; padding: 16px 24px; font-size: 18px; font-weight: 600;">
        Liftelo
      </div>
      <div style="padding: 24px;">
        <h2 style="margin: 0 0 12px 0; font-size: 20px; color: #0f172a;">${title}</h2>
        <div style="font-size: 14px; line-height: 1.6; color: #334155;">
          ${content}
        </div>
        ${ctaBlock}
      </div>
      <div style="padding: 16px 24px; background: #f1f5f9; font-size: 12px; color: #64748b; text-align: center;">
        ${footerText || 'Liftelo • Elevator Operations'}
      </div>
    </div>
  </div>
  `;
}

module.exports = { buildEmailTemplate };
