// Findings module (step 1): shared logic for creating findings (inside RMS / intervention requests and manually),
// validating them, deriving the current state, and the in-app notifications. See docs/infrastructure.md section 19.
//
// Hard rules: every query filters by company_id; findings and finding_events are INSERT-only; the state is DERIVED from
// the latest event that carries a state and is never stored on `findings`.
const crypto = require('crypto');
const db = require('../db');
const { translate } = require('./i18n/translate');
const { normalizeLanguage } = require('./i18n/getResolvedLanguage');

const CATEGORIES = ['doors', 'car', 'ropes_suspension', 'drive_machine', 'controller', 'safety_devices', 'shaft_pit', 'intercom_emergency', 'other'];
const SEVERITIES = ['out_of_service', 'in_service', 'recommendation'];
const STATES = ['open', 'waiting_part', 'in_progress', 'resolved'];
const OPEN_STATES = ['open', 'waiting_part', 'in_progress'];
const SEVERITY_RANK = { out_of_service: 0, in_service: 1, recommendation: 2 };

// Status strings are DB values (never translated): the two repair statuses create a finding
const REPAIR_SEVERITY = {
  'Potreban popravak - Dizalo nije u funkciji': 'out_of_service',
  'Potreban popravak - Dizalo u funkciji': 'in_service'
};

const MAX_FINDINGS_PER_REQUEST = 50;
const MAX_DESCRIPTION = 2000;
const MAX_PART_NOTE = 255;

// Until the migration ran on an environment the tables do not exist: the rest of the app must keep working there.
let tablesCache = { present: false, checkedAt: 0 };
const hasFindingsTables = async () => {
  if (tablesCache.present) return true;
  if (tablesCache.checkedAt && Date.now() - tablesCache.checkedAt < 60 * 1000) return false;
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('findings', 'finding_events')`
  );
  tablesCache = { present: Number(rows[0].c) === 2, checkedAt: Date.now() };
  return tablesCache.present;
};

const cleanText = (value, max) =>
  String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, max);

/**
 * Validates one finding entry from a request. Returns { value } or { error: { status, code, error } }.
 * `severity` is passed in by the caller (derived from the RMS status for RMS/intervention findings).
 */
const normalizeFinding = (raw, severity) => {
  const description = cleanText(raw?.description, MAX_DESCRIPTION);
  if (!description) {
    return { error: { status: 400, code: 'finding_description_required', error: 'Finding description is required' } };
  }
  const category = raw?.category === undefined || raw?.category === null || raw?.category === '' ? 'other' : String(raw.category);
  if (!CATEGORIES.includes(category)) {
    return { error: { status: 400, code: 'invalid_request', error: 'Invalid finding category' } };
  }
  if (!SEVERITIES.includes(severity)) {
    return { error: { status: 400, code: 'invalid_request', error: 'Invalid finding severity' } };
  }
  const needsPart = raw?.needs_part === true || raw?.needs_part === 1 || raw?.needs_part === '1' || raw?.needs_part === 'true';
  const partNote = needsPart ? (cleanText(raw?.part_note, MAX_PART_NOTE) || null) : null;
  return { value: { description, category, severity, needs_part: needsPart ? 1 : 0, part_note: partNote } };
};

// Per-finding idempotency key derived from the request's client_request_id (<= 64 chars, stable across replays)
const derivedRequestId = (clientRequestId, index) =>
  clientRequestId ? `f-${crypto.createHash('sha1').update(`${clientRequestId}:${index}`).digest('hex')}` : null;

/**
 * Validates the `findings` array of an RMS / intervention request against the request's items.
 * items: [{ elevator_label, status }]. Each finding names an elevator_label whose item has a repair status.
 * Returns { findings: [{ elevator_label, severity, ...normalized }] } or { error }.
 */
const prepareRequestFindings = (rawFindings, items) => {
  if (rawFindings === undefined || rawFindings === null || rawFindings === '') return { findings: [] };
  if (!Array.isArray(rawFindings)) {
    return { error: { status: 400, code: 'invalid_request', error: 'findings must be an array' } };
  }
  if (rawFindings.length > MAX_FINDINGS_PER_REQUEST) {
    return { error: { status: 400, code: 'invalid_request', error: 'Too many findings' } };
  }
  const severityByLabel = new Map();
  for (const item of items || []) {
    if (item?.elevator_label && REPAIR_SEVERITY[item.status]) severityByLabel.set(item.elevator_label, REPAIR_SEVERITY[item.status]);
  }
  const seen = new Set();
  const out = [];
  for (const raw of rawFindings) {
    const label = typeof raw?.elevator_label === 'string' ? raw.elevator_label : '';
    const severity = severityByLabel.get(label);
    if (!label || !severity) {
      return { error: { status: 400, code: 'finding_requires_repair_status', error: 'A finding needs an item with a repair status for the same elevator' } };
    }
    if (seen.has(label)) {
      return { error: { status: 400, code: 'invalid_request', error: 'Only one finding per elevator and request' } };
    }
    seen.add(label);
    const normalized = normalizeFinding(raw, severity);
    if (normalized.error) return normalized;
    out.push({ elevator_label: label, ...normalized.value });
  }
  return { findings: out };
};

const resolveElevatorId = async (connection, companyId, locationId, label) => {
  const [[row]] = await connection.query(
    'SELECT id FROM elevators WHERE company_id = ? AND location_id = ? AND label = ? ORDER BY id ASC LIMIT 1',
    [companyId, locationId, label]
  );
  return row?.id ?? null;
};

/**
 * INSERTs findings + their 'opened' events through `connection` (the caller's open transaction).
 * entries: [{ elevator_label, elevator_id?, severity, description, category, needs_part, part_note, source_id }]
 * Idempotency: each finding gets a request id derived from the request's client_request_id.
 */
const insertFindings = async (connection, { companyId, userId, locationId, locationName, sourceType, clientRequestId, entries }) => {
  const created = [];
  let index = 0;
  for (const entry of entries) {
    const elevatorId = entry.elevator_id ?? await resolveElevatorId(connection, companyId, locationId, entry.elevator_label);
    const requestId = entry.client_request_id ?? derivedRequestId(clientRequestId, index);
    index += 1;
    const [result] = await connection.query(
      `INSERT INTO findings
        (company_id, location_id, location_name, elevator_id, elevator_label, source_type, source_id, description, category,
         severity, needs_part, part_note, created_by_user_id, client_request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyId, locationId, locationName || null, elevatorId, entry.elevator_label, sourceType, entry.source_id ?? null,
        entry.description, entry.category, entry.severity, entry.needs_part, entry.part_note, userId || null, requestId]
    );
    await connection.query(
      `INSERT INTO finding_events (finding_id, company_id, event_type, state, note, user_id)
       VALUES (?, ?, 'opened', 'open', NULL, ?)`,
      [result.insertId, companyId, userId || null]
    );
    created.push({
      id: result.insertId, elevator_label: entry.elevator_label, severity: entry.severity,
      description: entry.description, location_name: locationName || null
    });
  }
  return created;
};

// ---- derived state (SQL fragments shared by list / summary / detail) ----
// Latest event that carries a state wins (created_at, then id). All subqueries repeat the company_id filter.
const DERIVED_SELECT = `
  SELECT f.*,
    (SELECT e.state FROM finding_events e
      WHERE e.finding_id = f.id AND e.company_id = f.company_id AND e.state IS NOT NULL
      ORDER BY e.created_at DESC, e.id DESC LIMIT 1) AS state,
    (SELECT MAX(e.created_at) FROM finding_events e
      WHERE e.finding_id = f.id AND e.company_id = f.company_id AND e.event_type = 'parts_ordered') AS parts_ordered_at,
    (SELECT MAX(e.created_at) FROM finding_events e
      WHERE e.finding_id = f.id AND e.company_id = f.company_id AND e.state = 'resolved') AS resolved_at
  FROM findings f
  WHERE f.company_id = ?`;

const serializeFinding = (row) => {
  const state = row.state || 'open';
  const resolved = state === 'resolved';
  const end = resolved && row.resolved_at ? new Date(row.resolved_at) : new Date();
  const days = Math.max(0, Math.floor((end.getTime() - new Date(row.created_at).getTime()) / 86400000));
  return {
    id: row.id,
    location_id: row.location_id,
    location_name: row.location_name_live || row.location_name,
    elevator_id: row.elevator_id,
    elevator_label: row.elevator_label,
    source_type: row.source_type,
    source_id: row.source_id,
    description: row.description,
    category: row.category,
    severity: row.severity,
    needs_part: Boolean(row.needs_part),
    part_note: row.part_note,
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
    state,
    parts_ordered: Boolean(row.parts_ordered_at),
    parts_ordered_at: row.parts_ordered_at || null,
    resolved_at: resolved ? row.resolved_at || null : null,
    days_open: days
  };
};

// ---- state machine ----
// returns the target state for an event, or null when the transition is not allowed
const nextState = (current, eventType, requestedState) => {
  switch (eventType) {
    case 'status_changed':
      if (current === 'resolved' || !OPEN_STATES.includes(requestedState) || requestedState === current) return null;
      return requestedState;
    case 'parts_ordered':
      return current === 'resolved' ? null : 'waiting_part';
    case 'resolved':
      return current === 'resolved' ? null : 'resolved';
    case 'reopened':
      return current === 'resolved' ? 'open' : null;
    default:
      return null;
  }
};

// ---- notifications (in-app only; no e-mail is queued for findings) ----
const getMemberIds = async (companyId, roles) => {
  const [rows] = await db.query(
    `SELECT u.id, u.language
     FROM user_companies uc
     INNER JOIN users u ON u.id = uc.user_id
     WHERE uc.company_id = ? AND uc.role IN (${roles.map(() => '?').join(',')})
       AND u.is_active = 1 AND u.disabled_at IS NULL`,
    [companyId, ...roles]
  );
  return rows;
};

/**
 * notifications: [{ recipients: [{id, language}], titleKey, messageKey, params, link }].
 * One multi-row INSERT for everything; text is translated per recipient language (users.language -> company -> hr).
 */
const insertNotifications = async (companyId, notifications) => {
  const [[company]] = await db.query('SELECT default_language FROM companies WHERE id = ? LIMIT 1', [companyId]);
  const fallback = normalizeLanguage(company?.default_language);
  const rows = [];
  for (const n of notifications) {
    for (const recipient of n.recipients) {
      const lang = normalizeLanguage(recipient.language, fallback);
      rows.push([recipient.id, 'finding', translate(n.titleKey, lang, n.params), translate(n.messageKey, lang, n.params), n.link]);
    }
  }
  if (!rows.length) return 0;
  await db.query('INSERT INTO notifications (user_id, type, title, message, link) VALUES ?', [rows]);
  return rows.length;
};

const shortText = (text, max = 120) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** New findings: out_of_service -> all admins + all technicians; others -> admins only. The actor never gets his own notification. */
const notifyNewFindings = async ({ companyId, actorUserId, findings }) => {
  if (!findings.length) return;
  const admins = await getMemberIds(companyId, ['admin']);
  const needsTechnicians = findings.some((f) => f.severity === 'out_of_service');
  const technicians = needsTechnicians ? await getMemberIds(companyId, ['technician']) : [];
  const notAnActor = (list) => list.filter((u) => u.id !== actorUserId);
  const notifications = findings.map((f) => ({
    recipients: notAnActor(f.severity === 'out_of_service' ? [...admins, ...technicians] : admins),
    titleKey: f.severity === 'out_of_service' ? 'notifications:findingNewUrgent.title' : 'notifications:findingNew.title',
    messageKey: f.severity === 'out_of_service' ? 'notifications:findingNewUrgent.message' : 'notifications:findingNew.message',
    params: { elevator: f.elevator_label, location: f.location_name || '', description: shortText(f.description) },
    link: `/dashboard/findings?id=${f.id}`
  }));
  await insertNotifications(companyId, notifications);
};

/** parts_ordered / resolved: the creator + all admins, not the actor. */
const notifyFindingEvent = async ({ companyId, actorUserId, finding, eventType }) => {
  const admins = await getMemberIds(companyId, ['admin']);
  const recipients = [...admins];
  if (finding.created_by_user_id && !recipients.some((u) => u.id === finding.created_by_user_id)) {
    const [[creator]] = await db.query(
      `SELECT u.id, u.language FROM user_companies uc INNER JOIN users u ON u.id = uc.user_id
       WHERE uc.company_id = ? AND uc.user_id = ? AND u.is_active = 1 AND u.disabled_at IS NULL LIMIT 1`,
      [companyId, finding.created_by_user_id]
    );
    if (creator) recipients.push(creator);
  }
  const key = eventType === 'parts_ordered' ? 'findingPartsOrdered' : 'findingResolved';
  await insertNotifications(companyId, [{
    recipients: recipients.filter((u) => u.id !== actorUserId),
    titleKey: `notifications:${key}.title`,
    messageKey: `notifications:${key}.message`,
    params: { elevator: finding.elevator_label, location: finding.location_name || '' },
    link: `/dashboard/findings?id=${finding.id}`
  }]);
};

module.exports = {
  CATEGORIES, SEVERITIES, STATES, OPEN_STATES, SEVERITY_RANK, REPAIR_SEVERITY,
  hasFindingsTables, normalizeFinding, prepareRequestFindings, insertFindings, resolveElevatorId,
  DERIVED_SELECT, serializeFinding, nextState, notifyNewFindings, notifyFindingEvent, cleanText
};
