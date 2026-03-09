const fs = require('fs');
const path = require('path');

const caches = new Map();

const getCache = (key) => {
  if (!caches.has(key)) caches.set(key, new Map());
  return caches.get(key);
};

const loadTranslations = ({ namespace, language, defaultLanguage = 'en' }) => {
  const normalized = language === 'hr' || language === 'en' ? language : defaultLanguage;
  const cache = getCache(namespace);
  if (cache.has(normalized)) return cache.get(normalized);

  const filePath = path.join(__dirname, '..', '..', 'locales', normalized, `${namespace}.json`);
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  cache.set(normalized, parsed);
  return parsed;
};

module.exports = {
  loadTranslations
};
