const db = require('../db');

/*
 * "Work / material table" rows (name, quantity, unit, hours) shared by interventions (intervention_work_lines, INSERT-only,
 * created with the intervention) and work orders (work_order_work_lines, replaced as a whole while the order is open).
 * Request field: `work_lines` (array; on multipart interventions a JSON string). Migration: 20261115_work_lines.sql.
 * The unit is a short stable code (UNIT_CODES, translated in the UI and in the PDF) or free text (<= 20 chars).
 */

const MAX_LINES = 30;
const NAME_MAX = 200;
const UNIT_MAX = 20;
const QTY_MAX = 1000000;
const HOURS_MAX = 10000;
const UNIT_CODES = ['pcs', 'm', 'h', 'l', 'kg', 'set', 'lump'];

const TABLES = {
  intervention: { table: 'intervention_work_lines', fk: 'intervention_id' },
  work_order: { table: 'work_order_work_lines', fk: 'work_order_id' }
};

const clean = (value, max) =>
  String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max + 1);

class WorkLineError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const isBlank = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

// "1,5" / "1.5" / 1.5 -> 1.5 (2 decimals). Returns null for blank, undefined when invalid (not a number, negative, too large).
const parseDecimal = (value, max) => {
  if (isBlank(value)) return null;
  let number;
  if (typeof value === 'number') number = value;
  else {
    const text = String(value).trim().replace(/\s/g, '');
    if (!/^\d+([.,]\d+)?$|^[.,]\d+$/.test(text)) return undefined;
    number = Number(text.replace(',', '.'));
  }
  if (!Number.isFinite(number) || number < 0 || number > max) return undefined;
  return Math.round(number * 100) / 100;
};

/**
 * Validates the raw `work_lines` of a request. Completely empty rows are dropped. Returns an array of
 * { position, name, quantity, unit, hours } or throws WorkLineError (400, stable `code`).
 */
function prepareWorkLines(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  if (!Array.isArray(raw)) throw new WorkLineError(400, 'invalid_request', 'work_lines must be an array');
  if (raw.length > MAX_LINES * 4) throw new WorkLineError(400, 'too_many_work_lines', 'Too many work lines');
  const lines = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') throw new WorkLineError(400, 'invalid_request', 'Invalid work line');
    const name = clean(row.name, NAME_MAX);
    const unit = clean(row.unit, UNIT_MAX);
    if (!name && isBlank(row.quantity) && isBlank(row.hours) && !unit) continue;
    if (!name) throw new WorkLineError(400, 'work_line_name_required', 'Each work line needs a name');
    if (name.length > NAME_MAX) throw new WorkLineError(400, 'work_line_name_too_long', 'Work line name is too long');
    if (unit.length > UNIT_MAX) throw new WorkLineError(400, 'work_line_unit_too_long', 'Work line unit is too long');
    const quantity = parseDecimal(row.quantity, QTY_MAX);
    const hours = parseDecimal(row.hours, HOURS_MAX);
    if (quantity === undefined || hours === undefined) {
      throw new WorkLineError(400, 'work_line_invalid_number', 'Quantity and hours must be numbers >= 0');
    }
    lines.push({ name, quantity, unit: unit || null, hours });
  }
  if (lines.length > MAX_LINES) throw new WorkLineError(400, 'too_many_work_lines', 'Too many work lines');
  return lines.map((line, index) => ({ position: index + 1, ...line }));
}

// Until the migration ran the tables do not exist: the rest of the app must keep working there.
const tableCache = new Map();
const hasWorkLinesTable = async (kind) => {
  const cfg = TABLES[kind];
  if (!cfg) return false;
  const cached = tableCache.get(cfg.table);
  if (cached && (cached.present || Date.now() - cached.at < 60 * 1000)) return cached.present;
  const [rows] = await db.query(
    'SELECT 1 AS ok FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1',
    [cfg.table]
  );
  tableCache.set(cfg.table, { present: rows.length > 0, at: Date.now() });
  return rows.length > 0;
};

// test hook: forget the cached table checks
const resetWorkLinesCache = () => tableCache.clear();

const isMissingTable = (err) => err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146);

async function insertWorkLines(conn, kind, { companyId, parentId, lines }) {
  const cfg = TABLES[kind];
  for (const line of lines) {
    await conn.query(
      `INSERT INTO ${cfg.table} (company_id, ${cfg.fk}, position, name, quantity, unit, hours) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [companyId, parentId, line.position, line.name, line.quantity, line.unit, line.hours]
    );
  }
}

// work orders only (interventions are INSERT-only): replace the whole row set inside the caller's transaction
async function replaceWorkOrderWorkLines(conn, { companyId, workOrderId, lines }) {
  await conn.query('DELETE FROM work_order_work_lines WHERE company_id = ? AND work_order_id = ?', [companyId, workOrderId]);
  await insertWorkLines(conn, 'work_order', { companyId, parentId: workOrderId, lines });
}

const COLUMNS = 'id, position, name, quantity, unit, hours, created_at';
async function loadWorkLines(conn, kind, companyId, parentId) {
  const cfg = TABLES[kind];
  try {
    const [rows] = await conn.query(
      `SELECT ${COLUMNS} FROM ${cfg.table} WHERE company_id = ? AND ${cfg.fk} = ? ORDER BY position ASC, id ASC`,
      [companyId, parentId]
    );
    return rows;
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

const serializeWorkLine = (row) => ({
  id: row.id,
  position: row.position,
  name: row.name,
  quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
  unit: row.unit || null,
  hours: row.hours === null || row.hours === undefined ? null : Number(row.hours)
});

const totalHours = (lines) =>
  Math.round(lines.reduce((sum, line) => sum + (Number(line.hours) || 0), 0) * 100) / 100;

module.exports = {
  MAX_LINES, NAME_MAX, UNIT_MAX, QTY_MAX, HOURS_MAX, UNIT_CODES,
  WorkLineError, parseDecimal, prepareWorkLines, hasWorkLinesTable, insertWorkLines, replaceWorkOrderWorkLines,
  loadWorkLines, serializeWorkLine, totalHours, resetWorkLinesCache
};
