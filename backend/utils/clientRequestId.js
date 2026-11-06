// Idempotency for offline-tolerant entry: the app generates a client_request_id (UUID) once per record and re-sends the
// SAME id on every retry. (company_id, client_request_id) is UNIQUE on rms_visits and interventions
// (migration 20261111_offline_client_request_id.sql), so a retry returns the stored record instead of a duplicate.
const db = require('../db');

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** Returns the id if it has the expected shape, otherwise null (an invalid id is ignored, not an error). */
const parseClientRequestId = (value) => (typeof value === 'string' && REQUEST_ID_RE.test(value) ? value : null);

// Until the migration ran on an environment the column does not exist: the app must keep working there (no idempotency).
const columnCache = new Map();
const COLUMN_RECHECK_MS = 60 * 1000;

const hasClientRequestColumn = async (table) => {
  if (table !== 'rms_visits' && table !== 'interventions') return false;
  const cached = columnCache.get(table);
  if (cached && (cached.present || Date.now() - cached.checkedAt < COLUMN_RECHECK_MS)) return cached.present;
  const [rows] = await db.query(
    `SELECT 1 AS ok FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'client_request_id' LIMIT 1`,
    [table]
  );
  const present = rows.length > 0;
  columnCache.set(table, { present, checkedAt: Date.now() });
  return present;
};

const isDuplicateEntry = (err) => err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062;

module.exports = { parseClientRequestId, hasClientRequestColumn, isDuplicateEntry };
