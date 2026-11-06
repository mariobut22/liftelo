const db = require('../db');

// Single source of truth for the versions of the legal documents users must accept.
// The value is the version label stored in legal_acceptances.version. When a lawyer-approved text goes live, set it to the
// effective date of the published pages (e.g. '2026-12-01'): every user is then asked to accept again on the next login.
// (Drafts: docs/legal-drafts/. Go-live steps: docs/release-checklist.md.)
const LEGAL_VERSIONS = Object.freeze({
  terms: '2026-11-draft',
  privacy: '2026-11-draft',
});

const LEGAL_DOCUMENTS = Object.freeze(Object.keys(LEGAL_VERSIONS));

// How the acceptance was given (legal_acceptances.method)
const ACCEPT_METHODS = Object.freeze(['signup', 'invitation', 'activation', 'prompt']);

const isMissingTable = (err) => err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146);

// Writes one row per document for the current versions. `conn` can be a transaction connection.
// A missing table (migration not yet applied) must never break signup or login: it is logged and skipped.
const recordAcceptances = async ({ conn = db, userId, companyId = null, method, documents = LEGAL_DOCUMENTS }) => {
  if (!userId || !ACCEPT_METHODS.includes(method)) return false;
  try {
    for (const document of documents) {
      await conn.query(
        'INSERT INTO legal_acceptances (user_id, company_id, document, version, method) VALUES (?, ?, ?, ?, ?)',
        [userId, companyId || null, document, LEGAL_VERSIONS[document], method]
      );
    }
    return true;
  } catch (err) {
    if (isMissingTable(err)) {
      console.warn('[legal] legal_acceptances table missing (migration 20261110_legal_acceptances.sql not applied); acceptance not recorded');
      return false;
    }
    throw err;
  }
};

// { versions, accepted: { terms: bool, privacy: bool }, needs_acceptance }
const getAcceptanceStatus = async (userId) => {
  const accepted = {};
  LEGAL_DOCUMENTS.forEach((document) => { accepted[document] = false; });
  try {
    const [rows] = await db.query(
      'SELECT DISTINCT document, version FROM legal_acceptances WHERE user_id = ?',
      [userId]
    );
    for (const row of rows) {
      if (LEGAL_VERSIONS[row.document] === row.version) accepted[row.document] = true;
    }
  } catch (err) {
    if (isMissingTable(err)) {
      // Not yet migrated: do not lock anybody out of the UI because of a missing table.
      LEGAL_DOCUMENTS.forEach((document) => { accepted[document] = true; });
    } else {
      throw err;
    }
  }
  return {
    versions: { ...LEGAL_VERSIONS },
    accepted,
    needs_acceptance: LEGAL_DOCUMENTS.some((document) => !accepted[document]),
  };
};

module.exports = {
  LEGAL_VERSIONS,
  LEGAL_DOCUMENTS,
  ACCEPT_METHODS,
  recordAcceptances,
  getAcceptanceStatus,
};
