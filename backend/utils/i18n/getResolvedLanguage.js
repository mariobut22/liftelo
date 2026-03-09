const db = require('../../db');

const normalizeLanguage = (value, fallback) => {
  if (value === 'hr' || value === 'en') return value;
  return fallback;
};

async function getResolvedLanguage({
  userId,
  companyId,
  userLanguage,
  companyLanguage,
  fallback = 'en'
}) {
  if (userLanguage) return normalizeLanguage(userLanguage, fallback);
  if (companyLanguage) return normalizeLanguage(companyLanguage, fallback);

  let resolvedCompanyId = companyId || null;

  if (userId) {
    const [[row]] = await db.query(
      'SELECT language, company_id FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (row?.language) return normalizeLanguage(row.language, fallback);
    if (!resolvedCompanyId && row?.company_id) {
      resolvedCompanyId = row.company_id;
    }
  }

  if (resolvedCompanyId) {
    const [[companyRow]] = await db.query(
      'SELECT default_language FROM companies WHERE id = ? LIMIT 1',
      [resolvedCompanyId]
    );
    if (companyRow?.default_language) return normalizeLanguage(companyRow.default_language, fallback);
  }

  return fallback;
}

module.exports = {
  getResolvedLanguage,
  normalizeLanguage
};
