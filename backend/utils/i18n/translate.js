const { loadTranslations } = require('./loadTranslations');
const { normalizeLanguage, DEFAULT_LANGUAGE } = require('./getResolvedLanguage');

const lookup = (tree, dottedKey) =>
  dottedKey.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), tree);

const interpolate = (text, params) =>
  String(text).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, name) =>
    (params && params[name] !== undefined && params[name] !== null ? String(params[name]) : ''));

/**
 * translate('notifications:workOrderAssigned.title', 'hr', { id: 5 })
 * Key = "<namespace>:<dotted.path>" (namespace = backend/locales/<lang>/<namespace>.json).
 * Missing key in the language falls back to the other language, then to the key itself (never throws).
 */
function translate(namespacedKey, language, params) {
  const [namespace, key] = String(namespacedKey).includes(':')
    ? String(namespacedKey).split(':')
    : ['notifications', namespacedKey];
  const lang = normalizeLanguage(language, DEFAULT_LANGUAGE);
  for (const candidate of [lang, lang === 'hr' ? 'en' : 'hr']) {
    try {
      const value = lookup(loadTranslations({ namespace, language: candidate }), key);
      if (typeof value === 'string') return interpolate(value, params);
    } catch (err) {
      console.error('[i18n] cannot load translations', namespace, candidate, err.message);
    }
  }
  console.warn('[i18n] missing translation key', namespacedKey);
  return namespacedKey;
}

module.exports = { translate, interpolate };
