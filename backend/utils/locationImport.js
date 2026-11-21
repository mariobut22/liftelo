'use strict';
/*
 * Import of locations + elevators from an Excel (.xlsx) or CSV file.
 *
 * Pure parsing/validation (no database): parseImportFile() -> { type, headers, rows }, buildReport() -> row-by-row
 * validation report + the plan of what would be created. The route (routes/import.js) adds the database part
 * (existing locations, transaction, audit log). The file is NEVER trusted: the type comes from the content (zip signature
 * for xlsx, plain-text sanity for csv), never from the client's mimetype; limits are enforced here.
 *
 * File format: one row per elevator, the location columns repeated; rows with the same name + address (case/space
 * insensitive) become ONE location with several elevators; a row without an elevator creates only the location.
 */
const ExcelJS = require('exceljs');

const MB = 1024 * 1024;
const LIMITS = Object.freeze({
  MAX_BYTES: 2 * MB,
  MAX_ROWS: 500, // data rows (empty rows are ignored)
  MAX_COLUMNS: 60,
  MAX_SCANNED_ROWS: 5000, // physical rows looked at in a worksheet (guards against sparse "million empty rows" sheets)
  MAX_UNCOMPRESSED_BYTES: 20 * MB, // xlsx zip bomb guard
  MAX_ZIP_ENTRIES: 300,
  HEADER_SEARCH_ROWS: 10
});

// Maximum lengths = column sizes of locations / elevators (text columns: a sane cap).
const FIELD_MAX = Object.freeze({
  name: 255,
  address: 255,
  contact_person: 255,
  contact_phone: 50,
  upravitelj: 255,
  kljuc_strojarnice: 255,
  notes: 2000,
  elevator_label: 100,
  serial_number: 100,
  control_group_type: 100,
  cabin_door_type: 100,
  lock_type: 100,
  machine_room_key: 100,
  comment: 2000
});
const LOCATION_FIELDS = ['name', 'address', 'contact_person', 'contact_phone', 'upravitelj', 'kljuc_strojarnice', 'notes'];
const ELEVATOR_FIELDS = ['serial_number', 'control_group_type', 'cabin_door_type', 'lock_type', 'machine_room_key', 'comment'];
const MULTILINE_FIELDS = new Set(['notes', 'comment']);

// Header aliases (already normalised: lowercase, no diacritics, single spaces) -> field.
const ALIASES = {
  name: ['naziv', 'naziv lokacije', 'naziv zgrade', 'lokacija', 'zgrada', 'ime', 'name', 'location', 'location name', 'building', 'building name'],
  address: ['adresa', 'address', 'ulica', 'street'],
  contact_person: ['kontakt osoba', 'kontakt', 'kontakt osoba lokacije', 'contact person', 'contact'],
  contact_phone: ['telefon', 'tel', 'kontakt telefon', 'broj telefona', 'phone', 'phone number', 'telephone'],
  upravitelj: ['upravitelj', 'upravitelj zgrade', 'upravitelj nekretnine', 'manager', 'property manager', 'building manager'],
  kljuc_strojarnice: ['kljuc strojarnice', 'kljuc', 'machine room key', 'key', 'machine room key location'],
  notes: ['napomena', 'napomene', 'biljeske', 'notes', 'note'],
  rms_frequency: ['ucestalost rms', 'rms ucestalost', 'ucestalost', 'rms frekvencija', 'rms frequency', 'frequency', 'rms'],
  elevator_label: ['dizalo', 'oznaka dizala', 'oznaka', 'elevator', 'elevator label', 'lift', 'lift label', 'label'],
  serial_number: ['serijski broj', 'serijski', 'tvornicki broj', 'serial', 'serial number', 'serial no'],
  control_group_type: ['vrsta upravljanja', 'upravljanje', 'upravljacka grupa', 'control type', 'control group', 'control group type', 'controller'],
  cabin_door_type: ['vrata kabine', 'vrsta vrata kabine', 'cabin door', 'cabin door type', 'car door'],
  lock_type: ['vrsta brave', 'brava', 'lock', 'lock type'],
  machine_room_key: ['kljuc strojarnice dizala', 'kljuc strojarnice dizalo', 'elevator machine room key', 'elevator key'],
  comment: ['komentar', 'komentar dizala', 'comment', 'elevator comment', 'comments']
};
const ALIAS_TO_FIELD = new Map();
for (const [field, list] of Object.entries(ALIASES)) for (const alias of list) ALIAS_TO_FIELD.set(alias, field);

class ImportError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const normalizeHeader = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[đĐ]/g, 'd')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Key for "same location": name + address, case/space insensitive (diacritics are kept: "Šćitara" != "Scitara").
const normalizeKeyPart = (value) => String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const locationKey = (name, address) => `${normalizeKeyPart(name)}\u0001${normalizeKeyPart(address)}`;

// ---------------------------------------------------------------- file type from content

const isZip = (buf) => buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
const BINARY_SIGNATURES = [
  Buffer.from('MZ'), Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.from('%PDF'), Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('GIF8'), Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.from('Rar!'),
  Buffer.from([0x1f, 0x8b]), Buffer.from('<!DOCTYPE', 'latin1'), Buffer.from('<html', 'latin1')
];

// Total uncompressed size / entry count from the zip central directory (no decompression).
function zipStats(buf) {
  const minEocd = 22;
  let eocd = -1;
  for (let i = buf.length - minEocd; i >= Math.max(0, buf.length - minEocd - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const entries = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  let total = 0;
  let seen = 0;
  while (seen < entries && offset + 46 <= buf.length && buf.readUInt32LE(offset) === 0x02014b50) {
    total += buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    offset += 46 + nameLen + extraLen + commentLen;
    seen += 1;
  }
  return { entries, total };
}

function decodeText(buf) {
  let body = buf;
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buf.subarray(2)).replace(/^﻿/, '');
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) body = buf.subarray(3);
  for (const sig of BINARY_SIGNATURES) {
    if (body.length >= sig.length && body.subarray(0, sig.length).equals(sig)) {
      throw new ImportError(415, 'import_invalid_file', 'Invalid file type');
    }
  }
  let controls = 0;
  for (let i = 0; i < body.length; i++) {
    const b = body[i];
    if (b === 0) throw new ImportError(415, 'import_invalid_file', 'Invalid file type');
    if ((b < 0x09) || (b > 0x0d && b < 0x20)) controls += 1;
  }
  if (controls > 0 && controls / body.length > 0.001) throw new ImportError(415, 'import_invalid_file', 'Invalid file type');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    // Excel "CSV (comma delimited)" in a Croatian Windows is Windows-1250
    return new TextDecoder('windows-1250').decode(body);
  }
}

// ---------------------------------------------------------------- csv

function detectDelimiter(text) {
  const counts = { ';': 0, ',': 0, '\t': 0 };
  let inQuotes = false;
  for (let i = 0; i < text.length && i < 20000; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) { if (counts[';'] + counts[','] + counts['\t'] > 0) break; }
    else if (!inQuotes && ch in counts) counts[ch] += 1;
  }
  if (counts[';'] >= counts[','] && counts[';'] >= counts['\t'] && counts[';'] > 0) return ';';
  if (counts[','] >= counts['\t'] && counts[','] > 0) return ',';
  if (counts['\t'] > 0) return '\t';
  return ';';
}

// RFC 4180: quotes, doubled quotes, delimiters and line breaks inside quotes. Returns an array of string arrays.
function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"' && field === '') { inQuotes = true; i += 1; continue; }
    if (ch === delimiter) { pushField(); i += 1; continue; }
    if (ch === '\r') { pushRow(); i += text[i + 1] === '\n' ? 2 : 1; if (rows.length > LIMITS.MAX_SCANNED_ROWS) break; continue; }
    if (ch === '\n') { pushRow(); i += 1; if (rows.length > LIMITS.MAX_SCANNED_ROWS) break; continue; }
    field += ch; i += 1;
  }
  if (field !== '' || row.length > 0) pushRow();
  return rows;
}

// ---------------------------------------------------------------- xlsx

function cellToString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part?.text ?? '').join('');
    if ('result' in value) return cellToString(value.result);
    if (typeof value.text === 'string') return value.text;
    if (value.text && typeof value.text === 'object') return cellToString(value.text);
    if ('error' in value) return '';
  }
  return '';
}

async function readXlsx(buf) {
  const stats = zipStats(buf);
  if (!stats) throw new ImportError(400, 'import_file_unreadable', 'The file could not be read');
  if (stats.total > LIMITS.MAX_UNCOMPRESSED_BYTES || stats.entries > LIMITS.MAX_ZIP_ENTRIES) {
    throw new ImportError(400, 'import_file_unreadable', 'The file could not be read');
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buf);
  } catch {
    throw new ImportError(400, 'import_file_unreadable', 'The file could not be read');
  }
  const sheet = workbook.worksheets.find((ws) => ws.actualRowCount > 0);
  if (!sheet) return [];
  const rows = [];
  let scanned = 0;
  let nonEmpty = 0;
  const columns = Math.min(sheet.columnCount || 0, LIMITS.MAX_COLUMNS);
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    scanned += 1;
    if (scanned > LIMITS.MAX_SCANNED_ROWS + LIMITS.MAX_ROWS) throw new ImportError(400, 'import_too_many_rows', 'Too many rows');
    const cells = [];
    for (let c = 1; c <= columns; c++) cells.push(cellToString(row.getCell(c).value));
    if (cells.some((v) => String(v).trim() !== '')) nonEmpty += 1;
    rows.push({ rowNumber, cells });
    // header (max. 10 rows) + data: stop early on a clearly oversized sheet
    if (nonEmpty > LIMITS.MAX_ROWS + LIMITS.HEADER_SEARCH_ROWS + 1) throw new ImportError(400, 'import_too_many_rows', 'Too many rows');
  });
  return rows;
}

// ---------------------------------------------------------------- parse entry point

const cleanCell = (value, field) => {
  let text = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  text = MULTILINE_FIELDS.has(field) ? text.replace(/\r\n?/g, '\n').trim() : text.replace(/[\r\n\t]+/g, ' ').trim();
  return text;
};

/**
 * @param {{buffer: Buffer, originalname?: string}} file multer memory file
 * @returns {Promise<{type: 'xlsx'|'csv', columns: Array<{index:number, header:string, field:string|null}>, rows: Array<{row:number, values:Object}>}>}
 * @throws {ImportError}
 */
async function parseImportFile(file) {
  const buf = file?.buffer;
  if (!Buffer.isBuffer(buf)) throw new ImportError(400, 'import_file_required', 'A file is required');
  if (buf.length === 0) throw new ImportError(400, 'import_file_empty', 'The file is empty');
  if (buf.length > LIMITS.MAX_BYTES) throw new ImportError(413, 'import_file_too_large', 'The file is too large');

  const ext = String(file.originalname || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
  if (ext !== 'xlsx' && ext !== 'csv') throw new ImportError(415, 'import_invalid_file', 'Invalid file type');

  let type;
  let table; // array of { rowNumber, cells[] }
  if (isZip(buf)) {
    if (ext !== 'xlsx') throw new ImportError(415, 'import_invalid_file', 'Invalid file type');
    type = 'xlsx';
    table = await readXlsx(buf);
  } else {
    if (ext !== 'csv') throw new ImportError(415, 'import_invalid_file', 'Invalid file type');
    type = 'csv';
    const text = decodeText(buf).replace(/^﻿/, '');
    const records = parseCsv(text, detectDelimiter(text));
    table = records.map((cells, i) => ({ rowNumber: i + 1, cells: cells.slice(0, LIMITS.MAX_COLUMNS) }));
  }

  const isBlank = (r) => r.cells.every((v) => String(v ?? '').trim() === '');
  const nonBlank = table.filter((r) => !isBlank(r));
  if (nonBlank.length === 0) throw new ImportError(400, 'import_file_empty', 'The file is empty');

  // header row: the first row (within the first 10) that has both a name and an address column
  let headerAt = -1;
  let columns = [];
  for (let i = 0; i < Math.min(nonBlank.length, LIMITS.HEADER_SEARCH_ROWS); i++) {
    const seen = new Set();
    const cols = nonBlank[i].cells.map((header, index) => {
      const field = ALIAS_TO_FIELD.get(normalizeHeader(header)) || null;
      if (field && seen.has(field)) return { index, header: String(header ?? '').trim(), field: null }; // a repeated column is ignored
      if (field) seen.add(field);
      return { index, header: String(header ?? '').trim(), field };
    });
    if (seen.has('name') && seen.has('address')) { headerAt = i; columns = cols; break; }
  }
  if (headerAt < 0) throw new ImportError(400, 'import_missing_columns', 'The file needs a name column and an address column');

  const dataRows = nonBlank.slice(headerAt + 1);
  if (dataRows.length === 0) throw new ImportError(400, 'import_file_empty', 'The file has no data rows');
  if (dataRows.length > LIMITS.MAX_ROWS) throw new ImportError(400, 'import_too_many_rows', 'Too many rows');

  const rows = dataRows.map((r) => {
    const values = {};
    for (const col of columns) {
      if (!col.field) continue;
      values[col.field] = cleanCell(r.cells[col.index], col.field);
    }
    return { row: r.rowNumber, values };
  });
  return { type, columns: columns.filter((c) => c.header !== ''), rows };
}

// ---------------------------------------------------------------- validation + grouping

function parseRmsFrequency(raw) {
  const text = normalizeHeader(raw);
  if (!text) return { value: null };
  if (/^[123]$/.test(text) || /^[123] 0+$/.test(text)) return { value: Number(text[0]) };
  if (/^(mjesecno|svaki mjesec|monthly|every month)$/.test(text)) return { value: 1 };
  if (/^(dvomjesecno|bimonthly|every other month)$/.test(text)) return { value: 2 };
  if (/^(tromjesecno|kvartalno|quarterly)$/.test(text)) return { value: 3 };
  const m = /^(?:svaka |svaki |every )?([123]) (?:mjeseca|mjesec|mjesece|months?)$/.exec(text);
  if (m) return { value: Number(m[1]) };
  return { value: null, invalid: true };
}

/**
 * @param {Array<{row:number, values:Object}>} rows from parseImportFile
 * @param {Set<string>} existingKeys locationKey() of the company's existing locations (only that company's!)
 */
function buildReport(rows, existingKeys = new Set()) {
  const report = [];
  const groups = new Map();

  for (const item of rows) {
    const v = item.values;
    const messages = [];
    const err = (code, params) => messages.push({ code, level: 'error', ...(params ? { params } : {}) });
    const warn = (code, params) => messages.push({ code, level: 'warning', ...(params ? { params } : {}) });
    const info = (code, params) => messages.push({ code, level: 'info', ...(params ? { params } : {}) });

    const get = (f) => v[f] || '';
    if (!get('name')) err('name_required');
    if (!get('address')) err('address_required');
    for (const [field, max] of Object.entries(FIELD_MAX)) {
      if (get(field).length > max) err('field_too_long', { field, max });
    }
    const freq = parseRmsFrequency(get('rms_frequency'));
    if (freq.invalid) err('invalid_rms_frequency');
    const hasElevatorData = ELEVATOR_FIELDS.some((f) => get(f) !== '');
    if (!get('elevator_label') && hasElevatorData) err('elevator_label_required');

    const entry = {
      row: item.row,
      status: 'ok',
      name: get('name'),
      address: get('address'),
      elevator: get('elevator_label') || null,
      messages,
      _item: item,
      _freq: freq.value,
      _key: null
    };
    report.push(entry);
    if (messages.some((m) => m.level === 'error')) continue;

    const key = locationKey(get('name'), get('address'));
    entry._key = key;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        exists: existingKeys.has(key),
        location: { rms_frequency: null },
        elevatorKeys: new Set(),
        rows: []
      };
      for (const f of LOCATION_FIELDS) group.location[f] = '';
      groups.set(key, group);
    }
    group.rows.push(entry);

    // merge location fields over the rows of the group: first non-empty value wins
    for (const f of LOCATION_FIELDS) {
      const cur = group.location[f];
      const val = get(f);
      if (!cur && val) group.location[f] = val;
      else if (cur && val && normalizeKeyPart(cur) !== normalizeKeyPart(val)) info('location_value_differs', { field: f });
    }
    if (freq.value !== null) {
      if (group.location.rms_frequency === null) group.location.rms_frequency = freq.value;
      else if (group.location.rms_frequency !== freq.value) info('location_value_differs', { field: 'rms_frequency' });
    }

    if (group.exists) warn('location_exists');

    const label = get('elevator_label');
    if (label) {
      const elevKey = normalizeKeyPart(label);
      if (group.elevatorKeys.has(elevKey)) warn('duplicate_elevator_in_file', { label });
      else group.elevatorKeys.add(elevKey);
      entry._elevator = {
        label,
        serial_number: get('serial_number'),
        control_group_type: get('control_group_type'),
        cabin_door_type: get('cabin_door_type'),
        lock_type: get('lock_type'),
        machine_room_key: get('machine_room_key'),
        comment: get('comment')
      };
    }
  }

  for (const entry of report) {
    if (entry.messages.some((m) => m.level === 'error')) entry.status = 'error';
    else if (entry.messages.some((m) => m.level === 'warning')) entry.status = 'warning';
  }
  return { report, groups };
}

/** What gets created: rows with status ok (+ warning rows when includeWarnings). Error rows are never imported. */
function buildPlan(report, groups, includeWarnings = false) {
  const included = (entry) => entry.status === 'ok' || (includeWarnings && entry.status === 'warning');
  const plan = [];
  let elevators = 0;
  let skipped = 0;
  const byGroup = new Map();
  for (const entry of report) {
    if (!included(entry)) { skipped += 1; continue; }
    const arr = byGroup.get(entry._key) || [];
    arr.push(entry);
    byGroup.set(entry._key, arr);
  }
  for (const [key, entries] of byGroup) {
    const group = groups.get(key);
    const elevatorsOfGroup = entries.filter((e) => e._elevator).map((e) => e._elevator);
    elevators += elevatorsOfGroup.length;
    plan.push({ location: group.location, elevators: elevatorsOfGroup });
  }
  return { locations: plan, counts: { locations: plan.length, elevators, skipped } };
}

/** Client-facing report (no internal fields). */
function publicReport(report, groups, columns, type) {
  const rows = report.map((e) => ({
    row: e.row, status: e.status, name: e.name, address: e.address, elevator: e.elevator, messages: e.messages
  }));
  const count = (s) => rows.filter((r) => r.status === s).length;
  const strict = buildPlan(report, groups, false);
  const loose = buildPlan(report, groups, true);
  return {
    file: { type, rows: rows.length },
    columns: columns.map((c) => ({ header: c.header, field: c.field })),
    summary: {
      rows: rows.length,
      ok: count('ok'),
      warning: count('warning'),
      error: count('error'),
      will_create: strict.counts,
      will_create_with_warnings: loose.counts
    },
    rows
  };
}

module.exports = {
  LIMITS,
  FIELD_MAX,
  ALIASES,
  ImportError,
  normalizeHeader,
  locationKey,
  parseImportFile,
  buildReport,
  buildPlan,
  publicReport,
  // exported for tests
  parseCsv,
  detectDelimiter
};
