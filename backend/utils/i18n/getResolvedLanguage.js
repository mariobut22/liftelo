const db = require('../../db');

/**
 * Backend language resolution (see docs/i18n.md, "Backend i18n").
 * Only 'hr' and 'en' are valid. The primary market is Croatia, so the last-resort default is 'hr'.
 *
 *  - Documents (PDF, Excel): the company's default language -> getCompanyLanguage()
 *  - One recipient (email, in-app notification): users.language -> company default_language -> 'hr'
 *    -> getRecipientLanguage()
 */
const DEFAULT_LANGUAGE = 'hr';
const LOCALES = { hr: 'hr-HR', en: 'en-GB' };

const isValidLanguage = (value) => value === 'hr' || value === 'en';

const normalizeLanguage = (value, fallback = DEFAULT_LANGUAGE) => (isValidLanguage(value) ? value : fallback);

/** Intl/toLocale locale for a backend language (same as the frontend getLocale()). */
const getLocaleForLanguage = (language) => LOCALES[normalizeLanguage(language)];

async function getCompanyLanguage(companyId, fallback = DEFAULT_LANGUAGE) {
  if (!companyId) return fallback;
  const [[row]] = await db.query(
    'SELECT default_language FROM companies WHERE id = ? LIMIT 1',
    [companyId]
  );
  return normalizeLanguage(row?.default_language, fallback);
}

/**
 * Generic resolver: explicit userLanguage -> explicit companyLanguage -> users.language (by userId)
 * -> companies.default_language -> fallback. Invalid values are skipped, not returned.
 * For PDFs pass only { companyLanguage } (or use getCompanyLanguage).
 */
async function getResolvedLanguage({
  userId,
  companyId,
  userLanguage,
  companyLanguage,
  fallback = DEFAULT_LANGUAGE
}) {
  if (isValidLanguage(userLanguage)) return userLanguage;
  if (isValidLanguage(companyLanguage)) return companyLanguage;

  let resolvedCompanyId = companyId || null;

  if (userId) {
    const [[row]] = await db.query(
      'SELECT language, company_id FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (isValidLanguage(row?.language)) return row.language;
    if (!resolvedCompanyId && row?.company_id) {
      resolvedCompanyId = row.company_id;
    }
  }

  if (resolvedCompanyId) {
    return getCompanyLanguage(resolvedCompanyId, normalizeLanguage(fallback));
  }

  return normalizeLanguage(fallback);
}

/** Language for something addressed to ONE user: users.language -> company default -> 'hr'. */
function getRecipientLanguage({ userId, companyId, userLanguage, companyLanguage }) {
  return getResolvedLanguage({ userId, companyId, userLanguage, companyLanguage, fallback: DEFAULT_LANGUAGE });
}

module.exports = {
  DEFAULT_LANGUAGE,
  getResolvedLanguage,
  getRecipientLanguage,
  getCompanyLanguage,
  getLocaleForLanguage,
  normalizeLanguage,
  isValidLanguage
};
