const { loadTranslations } = require('../i18n/loadTranslations');
const { normalizeLanguage } = require('../i18n/getResolvedLanguage');

/**
 * Templates never carry their own fallback text: they use the email.json strings handed in by
 * emailService (already in the recipient's language) or load them for the given language.
 */
function requireTranslations(translations, language) {
  if (translations && translations.footer) return translations;
  return loadTranslations({ namespace: 'email', language: normalizeLanguage(language) });
}

module.exports = { requireTranslations };
