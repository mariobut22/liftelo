/* Fake API for the mobile harness. Unknown GETs return []; unknown writes return {}. */
let authed = true
// company branding + web push state (branding-check.cjs / push-check.cjs)
let brand = { logo_path: null, accent: null }
let pushState = { enabled: false, subscribed: new Set(), calls: [], testSent: 1 }
let exportState = { allowed: true, retry_after_seconds: 0, in_progress: false, files: { count: 12, bytes: 38 * 1024 * 1024, missing: 0, refused: 0, included: true, max_included_bytes: 524288000 } } // GET /api/company/export/check (legal-check.cjs)
let legalEnabled = true // GET /api/legal/config + /legal/status: false = LEGAL_ACCEPTANCE_ENABLED off on the server (default here: ON so older checks that tick the box stay valid)
let legalFail = false // true = GET /legal/config answers 500 (frontend must treat it as disabled)
let legalNeeded = false // /api/legal/status: true = the signed-in user still has to accept the Terms/Privacy (legal-check.cjs)
// work / material table state (work-lines-check.cjs): work orders 1 (open, empty) and 2 (completed, 1 row); interventions 1 (3 rows) and 2 (none)
const seedWoLines = () => ({ 1: [], 2: [{ id: 1, position: 1, name: 'Zamjena kontaktora', quantity: 2, unit: 'pcs', hours: 1.5 }] })
const seedIntLines = () => ({ 1: [{ id: 1, position: 1, name: 'Zamjena kontaktora', quantity: 2, unit: 'pcs', hours: 1.5 }, { id: 2, position: 2, name: 'Podmazivanje vodilica', quantity: null, unit: null, hours: 0.75 }, { id: 3, position: 3, name: 'Kabel', quantity: 12.5, unit: 'm', hours: null }], 2: [] })
let woLines = seedWoLines()
let intLines = seedIntLines()
let woAssigned = true // false = the signed-in technician is NOT assigned to the work orders
let userId = 1 // id of the signed-in fake user (offline-check.cjs switches it)
let userLanguage // undefined = same as `language`; null = account without saved language; 'en'|'hr' = explicit
let language = 'hr' // language returned for the user / company (set by the i18n render test)
const recorded = new Set() // every string value returned by the fake API (= "user data", ignored by the i18n leak scan)
const d = (n) => new Date(Date.now() - n * 864e5).toISOString()
const long = 'Stambena zgrada Vukovarska avenija 123 - Kombinirani ulaz A i B (Ivana Gundulica)'
const locations = [1, 2, 3].map((i) => ({
  id: i, name: i === 1 ? long : `Lokacija ${i}`, address: 'Ulica kralja Zvonimira 12, 51000 Rijeka', rms_frequency: 1,
  contact_person: 'Ivan Horvat', contact_phone: '+385 91 234 5678', upravitelj: 'Upravitelj d.o.o.', kljuc_strojarnice: 'Portir', notes: 'Napomena',
  latitude: 45.3, longitude: 14.4, status: 'ok', last_activity: d(2),
  elevators: [{ id: i * 10 + 1, label: 'Lift A', serial_number: 'SN-12345' }, { id: i * 10 + 2, label: 'Lift B', serial_number: 'SN-54321' }],
  elevator_statuses: [{ elevator_label: 'Lift A', status: 'ok' }, { elevator_label: 'Lift B', status: 'warning' }],
}))
const user = (role) => ({ id: userId, username: role === 'superadmin' ? 'superadmin' : 'marijana.kovacevic', email: 'mario.verylongemailaddress@example-company.com', role, global_role: role === 'superadmin' ? 'superadmin' : 'user', is_active: 1, full_name: 'Marijana Kovačević', company_id: 1, language: userLanguage === undefined ? language : userLanguage, status: 'active', created_at: d(30), last_login: d(1) })
const plan = { id: 2, code: 'pro', name: 'Pro', billing_interval: 'monthly', price_cents: 5900, seats_included: 7, admin_limit: 2, technician_limit: 5, trial_days: 7 }
const billing = { company_id: 1, access: { locked: false, reason: null }, subscription: { id: 1, company_id: 1, status: 'active', trial_ends_at: null, current_period_end: d(-20), cancel_at_period_end: false, seats_override: null, admin_limit_override: null, technician_limit_override: null, plan }, usage: { active_members: 3, admins: 1, technicians: 2, admin_limit: 2, technician_limit: 5, pending_invites: 0, pending_admin_invites: 0, pending_technician_invites: 0, admins_remaining: 1, technicians_remaining: 3, can_add_admin: true, can_add_technician: true } }
const rms = [1, 2, 3].map((i) => ({ id: i, location_id: i, location_name: locations[i - 1].name, visit_date: d(i).slice(0, 10), rms_month: d(i).slice(0, 10), created_at: d(i), status: i === 2 ? 'warning' : 'ok', technician_name: 'Ivan Horvat', pdf_available: true, date: d(i) }))
const SHARE_TOKEN = 'Zk3pQ9vXw2LmN7aRtYb4HcDeFgJ6uIoPsT1VnBxCyAE' // 43 chars like the real tokens
let shareEnabled = false
const sharePayload = {
  generated_at: new Date().toISOString(), location: { name: long, address: 'Ulica kralja Zvonimira 12, 51000 Rijeka' }, company: { name: 'Rijeka Dizalo servis d.o.o.' },
  elevators: [{ label: 'Lift A', last_rms_date: '2026-11-12', next_rms_month: '2027-01', open_faults: 1 }, { label: 'Lift B', last_rms_date: null, next_rms_month: null, open_faults: 0 }],
  rms_visits: [{ date: '2026-11-12', technician: 'Ivan', elevator_count: 2, outcome: 'repair_in_service', items: [{ elevator: 'Lift A', status: 'repair_in_service' }, { elevator: 'Lift B', status: 'ok' }] }, { date: '2026-09-10', technician: 'Ivan', elevator_count: 2, outcome: 'ok', items: [] }],
  interventions: [{ date: '2026-10-20', technician: 'Marko', outcome: 'repair_out_of_service', elevators: ['Lift A'] }],
  open_faults: [{ elevator: 'Lift A', severity: 'out_of_service', date: '2026-11-01' }],
  pdf_available: false,
}
let ovwVisitsFail = false
let deadlinesFixture = null // rms-deadlines-check.cjs: GET /rms/deadlines answer; null = default sample (warning, 3 missing + 1 overdue); {__status: 500} = failure
let searchFail = false // search-check.cjs: GET /search answers 500
let searchDelayMs = 0 // search-check.cjs: slow answer (loading state)
const ovwMonths = {
  1: { 11: { service_date: '2026-11-20T00:00:00.000Z', invoice_status: 'not_invoiced' }, 10: { service_date: '2026-10-01T00:00:00.000Z', invoice_status: 'not_invoiced' }, 9: { service_date: '2026-09-09T00:00:00.000Z', invoice_status: 'invoiced' } },
  2: { 6: { service_date: '2026-06-03T00:00:00.000Z', invoice_status: 'invoiced' } },
}
const ovwVisits = {
  '1-11': [
    { id: 2, visit_date: '2026-11-20', rms_month: null, effective_date: '2026-11-20', created_at: d(1), technician_name: 'Ivan Horvat', item_count: 2, repair_count: 1, signature_state: 'awaiting_client' },
    { id: 1, visit_date: '2026-11-05', rms_month: null, effective_date: '2026-11-05', created_at: d(5), technician_name: 'Marijana Kovačević', item_count: 2, repair_count: 0, signature_state: 'completed' },
  ],
  '1-10': [{ id: 3, visit_date: '2026-11-06', rms_month: '2026-10-01', effective_date: '2026-10-01', created_at: d(4), technician_name: 'Ivan Horvat', item_count: 1, repair_count: 0, signature_state: 'unsigned' }],
  '2-6': [{ id: 2, visit_date: '2026-06-03', rms_month: null, effective_date: '2026-06-03', created_at: d(3), technician_name: null, item_count: 0, repair_count: 0, signature_state: null }],
}
const wo = [1, 2].map((i) => ({ id: i, location_id: i, location_name: locations[i - 1].name, issued_date: d(5), due_date: d(-3), status: i === 1 ? 'open' : 'completed', comment: 'Zamjena kontaktora u strojarnici', general_comment: 'Komentar', created_at: d(i), assigned_users: ['Ivan Horvat', 'Marko Perić'],
  items: [{ id: 1, text: 'Provjeriti vrata kabine', description: 'Provjeriti vrata kabine', is_completed: false }], elevators: [{ id: 11, label: 'Lift A' }], assigned_users_detail: [] }))
const vehicles = [1, 2].map((i) => ({ id: i, name: i === 1 ? 'Renault Kangoo ZG-1234-AB' : 'Fiat Doblo', year: 2019, last_registration_date: '2025-05-01', registration_expiry_date: '2026-05-01', image_path: null }))
const project = { id: 1, name: 'Modernizacija dizala zgrada Vukovarska', description: 'Opis projekta s dugim tekstom koji se mora prelomiti u više redova na malom ekranu', status: 'active', location_id: 1, location_name: locations[0].name, start_date: d(10), expected_end_date: d(-30), due_date: d(-30), created_at: d(10), progress_percent: 40, assigned_users: ['Ivan Horvat'], owner: { id: 1, full_name: 'Marijana Kovačević' },
  sections: [{ id: 1, title: 'Priprema', tasks: [{ id: 1, title: 'Naručiti materijal', description: 'x', is_completed: false, assigned_users: [{ id: 1, full_name: 'Ivan Horvat' }], comments: [{ id: 1, comment: 'ok', created_at: d(1), user: { id: 1, full_name: 'Ivan' } }] }] }], attachments: [] }
const users = [1, 2, 3].map((i) => ({ id: i, username: `korisnik${i}`, email: `korisnik.s.dugim.emailom${i}@primjer-tvrtke.hr`, role: ['admin', 'technician', 'viewer'][i - 1], is_active: 1, full_name: `Korisnik ${i}`, status: 'active', created_at: d(30), last_login: d(1) }))
const intPhotos = [
  { id: 1, file_path: '/uploads/interventions/1-i1-a.jpg', mime: 'image/jpeg', size_bytes: 1000, width: 400, height: 300, kind: 'before', caption: 'Prije zamjene', taken_at: d(5), created_at: d(5), legacy: false },
  { id: 2, file_path: '/uploads/interventions/1-i1-b.jpg', mime: 'image/jpeg', size_bytes: 1000, width: 400, height: 300, kind: 'after', caption: null, taken_at: d(5), created_at: d(5), legacy: false },
  { id: null, file_path: '/uploads/interventions/1-old.jpg', mime: null, size_bytes: null, width: null, height: null, kind: 'other', caption: null, taken_at: null, created_at: null, legacy: true },
]
const intervention = (i) => ({ id: i, location_id: i, location_name: locations[i - 1].name, visit_date: d(i).slice(0, 10), date: d(i), status: i === 3 ? 'Potreban popravak - Dizalo nije u funkciji' : 'O.K.', created_at: d(i), pdf_available: true, technician: 'Ivan Horvat', notes: 'Napomena', items: [{ id: 1, elevator_label: 'Lift A', comment: 'ok' }], work_lines: (intLines[i] || []), type: i === 2 ? 'INICIJATIVA' : 'POZIV', description: i === 1 ? 'Dizalo se zaustavlja između katova.\nPotrebna zamjena kontaktora i provjera vrata kabine - dug opis koji se mora prelomiti u više redova na malom ekranu.' : null, resolved: i === 3 ? 1 : 0, second_technician: i === 1 ? 'Marko Marić' : null })


// Superadmin companies overview (GET /api/superadmin/companies): one realistic row per interesting case
const saCompany = (id, name, o) => ({
  id, name, created_at: d(o.age ?? 60), subscription_status: o.sub ? o.sub.status : null, subscription_plan: o.sub ? o.sub.plan_code : null,
  subscription: o.sub ? { plan_name: o.sub.plan_code[0].toUpperCase() + o.sub.plan_code.slice(1), price_cents: 7900, trial_ends_at: null, current_period_end: null, cancel_at_period_end: false, has_stripe: false, ...o.sub } : null,
  limits: { admin: 1, technician: 2, admin_override: false, technician_override: false, ...(o.limits || {}) },
  usage: { admins: 1, technicians: 1, viewers: 0, ...(o.usage || {}) },
  access: o.access || { locked: false, reason: null },
  total_users: o.users ?? 2, total_locations: o.loc ?? 12, total_rms: o.rms ?? 140, total_interventions: o.int ?? 35, total_work_orders: 4,
  last_activity_at: o.last === undefined ? d(1) : o.last === null ? null : d(o.last), last_login_at: null,
})
const superadminCompanies = [
  saCompany(1, 'Rijeka Dizalo servis d.o.o.', { sub: { status: 'trial', plan_code: 'starter', trial_ends_at: new Date(Date.now() + 2 * 864e5).toISOString(), current_period_end: new Date(Date.now() + 2 * 864e5).toISOString() }, age: 12, last: 0 }),
  saCompany(2, 'Technique d.o.o.', { sub: { status: 'trial', plan_code: 'starter', has_stripe: true, trial_ends_at: d(2), current_period_end: d(2) }, access: { locked: true, reason: 'trial_expired' }, last: 9 }),
  saCompany(3, 'Zagreb Lift grupa, Zagrebačka ulica 12 - Dizala i servis', { sub: { status: 'active', plan_code: 'pro', price_cents: 17900, has_stripe: true, current_period_end: new Date(Date.now() + 18 * 864e5).toISOString() }, limits: { admin: 2, technician: 5 }, usage: { admins: 2, technicians: 4 }, users: 7, loc: 240, rms: 3120, int: 802, last: 0 }),
  saCompany(4, 'Over Limit servis', { sub: { status: 'active', plan_code: 'starter', has_stripe: true, cancel_at_period_end: true, current_period_end: new Date(Date.now() + 9 * 864e5).toISOString() }, limits: { admin: 1, technician: 2, admin_override: false }, usage: { admins: 2, technicians: 3 }, users: 5, last: 3 }),
  saCompany(5, 'Dospjela d.o.o.', { sub: { status: 'past_due', plan_code: 'pro', price_cents: 17900, has_stripe: true, current_period_end: d(4) }, access: { locked: true, reason: 'subscription_inactive' }, limits: { admin: 2, technician: 5 }, last: 5 }),
  saCompany(6, 'Mirni Lift obrt', { sub: { status: 'active', plan_code: 'corporate', price_cents: 39900, has_stripe: true, current_period_end: new Date(Date.now() + 25 * 864e5).toISOString() }, limits: { admin: null, technician: null, admin_override: true }, usage: { admins: 4, technicians: 9 }, users: 13, last: 21 }),
  saCompany(7, 'Nova tvrtka bez aktivnosti', { sub: { status: 'canceled', plan_code: 'starter', current_period_end: d(10) }, access: { locked: true, reason: 'subscription_inactive' }, age: 40, last: null, users: 1, loc: 0, rms: 0, int: 0 }),
  saCompany(8, 'Bez pretplate d.o.o.', { sub: null, age: 3, last: null, users: 1, loc: 0, rms: 0, int: 0 }),
]

// QR labels: stable fake tokens (24 url-safe chars, same shape as the backend's); regenerating an elevator swaps its token
const qrTokens = new Map()
const qrGen = new Map()
const qrTokenFor = (id) => {
  if (!qrTokens.has(id)) qrTokens.set(id, `Qk7Zp2mX9aLw4RtYb${String(id).padStart(3, '0')}${qrGen.get(id) || 0}Zee`)
  return qrTokens.get(id)
}
const qrLabel = (loc, e) => ({ id: e.id, label: e.label, serial_number: e.serial_number || null, location_id: loc.id, location_name: loc.name, qr_token: qrTokenFor(e.id) })

// ---- Findings (faults per elevator): small stateful fake of /api/findings (findings-check.cjs, offline-check.cjs)
const OOS_STATUS = 'Potreban popravak - Dizalo nije u funkciji'
let findingsDb = []
let findingsNextId = 100
const seedFindings = () => {
  const mk = (id, loc, el, label, severity, description, category, extra = {}) => ({
    id, location_id: loc, location_name: locations[loc - 1].name, elevator_id: el, elevator_label: label, source_type: 'rms_visit_item', source_id: id,
    description, category, severity, needs_part: false, part_note: null, created_by_user_id: 2, created_by_name: 'Ivan Horvat', created_at: d(extra.age ?? 3),
    state: 'open', parts_ordered: false, parts_ordered_at: null, resolved_at: null, ...extra,
    events: [{ id: id * 10, event_type: 'opened', state: 'open', note: null, user_id: 2, user_name: 'Ivan Horvat', intervention_id: null, work_order_id: null, created_at: d(extra.age ?? 3) }],
  })
  return [
    mk(1, 1, 11, 'Lift A', 'out_of_service', 'Vrata kabine se ne zatvaraju do kraja, dizalo je zaustavljeno na 3. katu.', 'doors', { age: 9, needs_part: true, part_note: 'komplet kotačića vrata' }),
    mk(2, 1, 12, 'Lift B', 'in_service', 'Bučan pogon pri vožnji prema gore; dizalo radi, ali treba zamijeniti ležaj.', 'drive_machine', { age: 5, needs_part: true, part_note: 'ležaj motora 6208' }),
    mk(3, 2, 21, 'Lift A', 'in_service', 'Trepće svjetlo u kabini.', 'car', { age: 2 }),
    mk(4, 2, 22, 'Lift B', 'recommendation', 'Preporuka: zamijeniti zaštitnu gumu na vratima kod sljedećeg servisa.', 'doors', { age: 20 }),
    mk(5, 3, 31, 'Lift A', 'in_service', 'Zamjena užadi dogovorena s upraviteljem.', 'ropes_suspension', { age: 14, needs_part: true, part_note: 'set užadi 8 mm', state: 'waiting_part', parts_ordered: true, parts_ordered_at: d(4) }),
    mk(6, 3, 32, 'Lift B', 'out_of_service', 'Prekidač u jami nije radio.', 'safety_devices', { age: 30, state: 'resolved', resolved_at: d(25), days_open: 5 }),
  ].map((f) => ({ ...f, days_open: f.days_open ?? Math.floor((Date.now() - new Date(f.created_at).getTime()) / 864e5) }))
}
findingsDb = seedFindings()
const sevRank = { out_of_service: 0, in_service: 1, recommendation: 2 }
const stripEvents = ({ events, created_by_name, ...f }) => f
const findingsList = (q) => {
  const state = q.get('state') || 'open'
  let rows = findingsDb.filter((f) => (state === 'all' ? true : state === 'open' ? f.state !== 'resolved' : f.state === state))
  if (q.get('severity')) rows = rows.filter((f) => f.severity === q.get('severity'))
  if (q.get('location_id')) rows = rows.filter((f) => f.location_id === Number(q.get('location_id')))
  if (q.get('elevator_id')) rows = rows.filter((f) => f.elevator_id === Number(q.get('elevator_id')))
  if (q.get('source_type')) rows = rows.filter((f) => f.source_type === q.get('source_type'))
  if (q.get('source_id')) rows = rows.filter((f) => f.source_id === Number(q.get('source_id')))
  if (q.get('needs_part') === '1') rows = rows.filter((f) => f.needs_part)
  if (q.get('parts_ordered') === '0') rows = rows.filter((f) => !f.parts_ordered)
  if (q.get('parts_ordered') === '1') rows = rows.filter((f) => f.parts_ordered)
  rows = [...rows].sort((a, b) => (a.state === 'resolved') - (b.state === 'resolved') || sevRank[a.severity] - sevRank[b.severity] || new Date(a.created_at) - new Date(b.created_at))
  return { items: rows.map(stripEvents), total: rows.length, limit: 50, offset: 0 }
}
const findingsSummary = () => {
  const open = findingsDb.filter((f) => f.state !== 'resolved')
  return {
    open: open.length, out_of_service: open.filter((f) => f.severity === 'out_of_service').length, in_service: open.filter((f) => f.severity === 'in_service').length,
    recommendation: open.filter((f) => f.severity === 'recommendation').length, needs_part: open.filter((f) => f.needs_part).length,
    to_order: open.filter((f) => f.needs_part && !f.parts_ordered).length, waiting_part: open.filter((f) => f.state === 'waiting_part').length,
    oldest_days: open.length ? Math.max(...open.map((f) => f.days_open)) : null,
  }
}
// GET /api/findings/by-location: open faults per location (only locations that have some)
let findingsFail = false
const findingsByLocation = () => {
  const out = []
  for (const f of findingsDb.filter((x) => x.state !== 'resolved')) {
    let row = out.find((r) => r.location_id === f.location_id)
    if (!row) { row = { location_id: f.location_id, open: 0, out_of_service: 0, in_service: 0, recommendation: 0, needs_part: 0, to_order: 0, oldest_days: 0 }; out.push(row) }
    row.open += 1
    row[f.severity] += 1
    if (f.needs_part) row.needs_part += 1
    if (f.needs_part && !f.parts_ordered) row.to_order += 1
    row.oldest_days = Math.max(row.oldest_days, f.days_open)
  }
  return { items: out }
}
const findingEvent = (role, f, body) => {
  if (body.event_type !== 'comment' && role !== 'admin') return { __status: 403, body: { error: 'x', code: 'findings_admin_only' } }
  const to = { status_changed: body.state, parts_ordered: 'waiting_part', resolved: 'resolved', reopened: 'open', comment: null }[body.event_type]
  if (body.event_type === 'reopened' && f.state !== 'resolved') return { __status: 409, body: { error: 'x', code: 'invalid_finding_transition' } }
  if (to) { f.state = to; if (to === 'resolved') f.resolved_at = new Date().toISOString() }
  if (body.event_type === 'parts_ordered') { f.parts_ordered = true; f.parts_ordered_at = new Date().toISOString() }
  f.events.push({ id: Date.now() % 100000, event_type: body.event_type, state: to, note: body.note || null, user_id: userId, user_name: 'Marijana Kovačević', intervention_id: null, work_order_id: null, created_at: new Date().toISOString() })
  return { id: 1, state: f.state }
}

// Report signatures (report-signature-check.cjs): derived state per report (id 1 waiting for the client, 2 completed, 3 closed
// without client signature); the fake POST actions change it. setVerify('ok'|'differs'|...) controls GET .../verify.
const sigStates = new Map()
let sigVerify = 'ok'
const sigStateOf = (type, id) => sigStates.get(type + ':' + id) || ({ 1: 'awaiting_client', 2: 'completed', 3: 'closed_without_client' })[id] || 'unsigned'
const sigInfo = (type, id) => {
  const state = sigStateOf(type, id)
  const timeline = [{ type: 'created', at: d(5) }]
  if (state !== 'unsigned') timeline.push({ type: 'technician_signed', at: d(4), name: 'Ivan Horvat' })
  if (state === 'completed') timeline.push(id === 2 ? { type: 'client_signed', method: 'drawn', at: d(2), name: 'Ana Anić', role: 'Upravitelj zgrade' } : { type: 'client_signed', method: 'scan', at: d(0), name: null, role: null, note: 'Primljeno e-mailom od upravitelja', by_name: 'Marijana Kovačević', scan_path: '/uploads/signed-reports/1-scan.pdf', completion_id: 9 })
  if (state === 'closed_without_client') timeline.push({ type: 'client_declined', method: 'declined', at: d(1), note: 'Klijent odbio potpisati', by_name: 'Ivan Horvat', completion_id: 8 })
  return { id, type, state, locked: state !== 'unsigned', document_number: (type === 'rms' ? 'RMS-' : 'INT-') + String(id).padStart(6, '0'), short_hash: state === 'unsigned' ? null : '3fa2c1d09ab4',
    technician: state === 'unsigned' ? null : { name: 'Ivan Horvat', at: d(4) }, client: null, awaiting_since: state === 'awaiting_client' ? d(4) : null, timeline, snapshots: [], scans: [] }
}
const sigRecords = (type, body) => {
  const rows = [1, 2, 3].map((i) => ({ ...(type === 'rms' ? rms[i - 1] : intervention(i)), technician: 'Ivan Horvat', items: [{ elevator_label: 'Lift A', comment: 'ok' }], document_name: 'x.pdf', signature_state: sigStateOf(type, i), date: d(i) }))
  return body.signature_state ? rows.filter((r) => r.signature_state === body.signature_state) : rows
}

// ---- Import of locations/elevators (import-check.cjs): the scenario is chosen by the uploaded FILE NAME (the real backend decides by content)
let locationsEmpty = false // true = the company has no locations yet (first-run guide, empty state)
let importApplyFailures = 0 // the next N apply calls answer 500 (retry must reuse the same client_request_id)
const importApplies = [] // every apply request seen: { requestId, includeWarnings }
const importMsg = (code, level, params) => ({ code, level, ...(params ? { params } : {}) })
const importRow = (row, status, name, address, elevator, messages = []) => ({ row, status, name, address, elevator, messages })
const importPreviewFor = (fileName) => {
  const lower = fileName.toLowerCase()
  const errs = { 'toomany': ['import_too_many_rows', 400], 'missing': ['import_missing_columns', 400], 'unreadable': ['import_file_unreadable', 400], 'invalid': ['import_invalid_file', 415], 'emptyfile': ['import_file_empty', 400], 'locked': ['subscription_locked', 402] }
  for (const [key, [code, status]] of Object.entries(errs)) if (lower.includes(key)) return { __status: status, body: { error: 'x', code } }
  let rows
  if (lower.includes('mixed')) {
    rows = [
      importRow(2, 'ok', 'Ulica Drage Šćitara 22', 'Drage Šćitara 22, Rijeka', 'D1'),
      importRow(3, 'ok', 'Ulica Drage Šćitara 22', 'Drage Šćitara 22, Rijeka', 'D2', [importMsg('location_value_differs', 'info', { field: 'contact_phone' })]),
      importRow(4, 'warning', 'Medovićeva 9', 'Medovićeva ul. 9, Rijeka', 'D1', [importMsg('location_exists', 'warning')]),
      importRow(5, 'error', '', 'Bez naziva 1', 'D1', [importMsg('name_required', 'error')]),
      importRow(6, 'error', 'Predugačko', 'Ulica 5', null, [importMsg('field_too_long', 'error', { field: 'contact_phone', max: 50 }), importMsg('invalid_rms_frequency', 'error')]),
      importRow(7, 'warning', 'Ulica Drage Šćitara 22', 'Drage Šćitara 22, Rijeka', 'D2', [importMsg('duplicate_elevator_in_file', 'warning', { label: 'D2' })]),
      importRow(8, 'ok', 'Krešimirova 10', 'Krešimirova ul. 10, 51000 Rijeka', null),
    ]
    for (let i = 9; i < 40; i++) rows.push(importRow(i, 'ok', `Zgrada broj ${i}`, `Ulica ${i}, Rijeka`, 'D1'))
  } else if (lower.includes('allbad')) {
    rows = [importRow(2, 'error', '', '', 'D1', [importMsg('name_required', 'error'), importMsg('address_required', 'error')])]
  } else {
    rows = [importRow(2, 'ok', 'Ulica Drage Šćitara 22', 'Drage Šćitara 22, Rijeka', 'D1'), importRow(3, 'ok', 'Ulica Drage Šćitara 22', 'Drage Šćitara 22, Rijeka', 'D2'), importRow(4, 'ok', 'Krešimirova 10', 'Krešimirova ul. 10, Rijeka', null)]
  }
  const count = (st) => rows.filter((r) => r.status === st).length
  const plan = (withWarnings) => {
    const used = rows.filter((r) => r.status === 'ok' || (withWarnings && r.status === 'warning'))
    return { locations: new Set(used.map((r) => r.name + '|' + r.address)).size, elevators: used.filter((r) => r.elevator).length, skipped: rows.length - used.length }
  }
  return { file: { type: lower.endsWith('.csv') ? 'csv' : 'xlsx', rows: rows.length }, columns: [{ header: 'Naziv', field: 'name' }, { header: 'Adresa', field: 'address' }, { header: 'Dizalo', field: 'elevator_label' }, { header: 'Boja', field: null }],
    summary: { rows: rows.length, ok: count('ok'), warning: count('warning'), error: count('error'), will_create: plan(false), will_create_with_warnings: plan(true) }, rows }
}

// role: admin | superadmin | technician | admin-ok (admin with nothing needing attention on the home page)
function resolve(method, url, scenario) {
  let m0
  const viewer = scenario === 'viewer'
  const role = scenario === 'admin-ok' ? 'admin' : viewer ? 'technician' : scenario
  const p = url.pathname.replace(/^\/api/, '')
  if (p === '/search') { // global search (search-check.cjs): case-insensitive contains, 5 per type, vehicles only for admins
    if (searchFail) return { __status: 500, body: { error: 'x' } }
    const q = (url.searchParams.get('q') || '').trim().toLowerCase()
    const empty = { query: q, locations: [], elevators: [], vehicles: [], rms: [], interventions: [], work_orders: [] }
    if (q.length < 2) return empty
    const has = (v) => String(v || '').toLowerCase().includes(q)
    const num = /^#?\d+$/.test(q) ? Number(q.replace('#', '')) : -1
    const hitLoc = locations.filter((l) => has(l.name) || has(l.address))
    const byLoc = (list, extra) => list.filter((r) => has(r.location_name) || has(locations[r.location_id - 1].address) || r.id === num).slice(0, 5).map((r) => ({ id: r.id, location_id: r.location_id, location_name: r.location_name, ...extra(r) }))
    return {
      query: q,
      locations: hitLoc.slice(0, 5).map((l) => ({ id: l.id, name: l.name, address: l.address })),
      elevators: locations.flatMap((l) => l.elevators.filter((e) => has(e.label) || has(e.serial_number)).map((e) => ({ id: e.id, label: e.label, serial_number: e.serial_number, location_id: l.id, location_name: l.name }))).slice(0, 5),
      vehicles: role === 'admin' ? vehicles.filter((v) => has(v.name)).slice(0, 5).map((v) => ({ id: v.id, name: v.name })) : [],
      rms: byLoc(rms, (r) => ({ date: r.visit_date })),
      interventions: byLoc([1, 2, 3].map((i) => intervention(i)), (r) => ({ date: r.date })),
      work_orders: byLoc(wo, (r) => ({ status: r.status, due_date: r.due_date })),
    }
  }
  if (p === '/login/check') return authed ? { user: user(role) } : { user: null }
  if (p === '/users/companies') return [{ id: 1, name: 'Rijeka Dizalo servis d.o.o.', role: viewer ? 'viewer' : role === 'technician' ? 'technician' : 'admin' }, { id: 2, name: 'Technique d.o.o.', role: 'technician' }]
  if (p === '/legal/config') return legalFail ? { __status: 500, body: { error: 'boom' } } : { acceptance_enabled: legalEnabled }
  if (p === '/legal/status' || (method === 'POST' && p === '/legal/accept')) {
    if (method === 'POST') legalNeeded = false
    if (!legalEnabled) return { enabled: false, required: [], versions: { terms: '2026-11-draft', privacy: '2026-11-draft' }, accepted: { terms: !legalNeeded, privacy: !legalNeeded }, needs_acceptance: false }
    return { enabled: true, required: legalNeeded ? ['terms', 'privacy'] : [], versions: { terms: '2026-11-draft', privacy: '2026-11-draft' }, accepted: { terms: !legalNeeded, privacy: !legalNeeded }, needs_acceptance: legalNeeded }
  }
  if (p === '/company/export/check') return exportState
  if (p === '/billing/current') return billing
  if (method === 'POST' && p === '/import/locations/preview') return importPreviewFor(url.searchParams.get('__file') || 'ok.xlsx')
  if (method === 'POST' && p === '/import/locations/apply') {
    importApplies.push({ requestId: url.searchParams.get('__rid'), includeWarnings: url.searchParams.get('__warn') === 'true' })
    if (importApplyFailures > 0) { importApplyFailures -= 1; return { __status: 500, body: { error: 'Import failed' } } }
    const preview = importPreviewFor(url.searchParams.get('__file') || 'ok.xlsx')
    const plan = url.searchParams.get('__warn') === 'true' ? preview.summary.will_create_with_warnings : preview.summary.will_create
    return { locations_created: plan.locations, elevators_created: plan.elevators, skipped: plan.skipped }
  }
  if (p === '/billing/plans') return [plan, { ...plan, id: 1, code: 'starter', name: 'Starter', price_cents: 2900 }, { ...plan, id: 3, code: 'corporate', name: 'Corporate', price_cents: 11900, admin_limit: null, technician_limit: null }]
  if (findingsFail && method === 'GET' && (p === '/findings/by-location' || p === '/findings')) return { __status: 500, body: { error: 'x' } }
  if (p === '/findings/by-location') return findingsByLocation()
  if (p === '/findings/summary') return findingsSummary()
  if (method === 'GET' && p === '/findings') return findingsList(url.searchParams)
  if (method === 'POST' && p === '/findings') {
    let body = {}
    try { body = JSON.parse(url.searchParams.get('__body') || '{}') } catch { /* ignore */ }
    const loc = locations.find((l) => l.id === body.location_id) || locations[0]
    const el = loc.elevators.find((e) => e.id === body.elevator_id) || loc.elevators[0]
    findingsDb.push({ id: findingsNextId++, location_id: loc.id, location_name: loc.name, elevator_id: el.id, elevator_label: el.label, source_type: 'manual', source_id: null, description: body.description || '', category: body.category || 'other', severity: body.severity || 'in_service', needs_part: Boolean(body.needs_part), part_note: body.part_note || null, created_by_user_id: userId, created_by_name: 'Marijana Kovačević', created_at: new Date().toISOString(), state: 'open', parts_ordered: false, parts_ordered_at: null, resolved_at: null, days_open: 0, events: [] })
    return { id: findingsNextId - 1 }
  }
  if ((m0 = p.match(/^\/findings\/(\d+)$/)) && method === 'GET') {
    const f = findingsDb.find((x) => x.id === Number(m0[1]))
    return f ? f : { __status: 404, body: { error: 'x', code: 'finding_not_found' } }
  }
  if ((m0 = p.match(/^\/findings\/(\d+)\/events$/)) && method === 'POST') {
    const f = findingsDb.find((x) => x.id === Number(m0[1]))
    let body = {}
    try { body = JSON.parse(url.searchParams.get('__body') || '{}') } catch { /* ignore */ }
    if (!f) return { __status: 404, body: { error: 'x', code: 'finding_not_found' } }
    return findingEvent(role === 'superadmin' ? 'admin' : role, f, body)
  }
  if (p === '/home/summary') {
    const ok = scenario === 'admin-ok'
    const day = (n) => new Date(Date.now() + n * 864e5).toISOString()
    const missingLocs = ok ? [] : [...locations.map((l) => ({ id: l.id, name: l.name })), ...[4, 5, 6, 7].map((i) => ({ id: i, name: `Zgrada ${i} - Ulica Ivana Mažuranića` }))]
    return {
      user: { id: 1, name: 'Marijana' }, user_stats: { rms_count: 12, intervention_count: 4 },
      rms_summary: ok ? { expected: 10, done: 10, late: 0, missing: 0 } : { expected: 10, done: 6, late: 2, missing: 2 },
      rms_missing_locations: missingLocs, alerts: { count: ok ? 0 : 2 },
      work_orders: { open_assigned_count: role === 'technician' ? 7 : (ok ? 0 : 2), items: role === 'technician' ? [1, 2, 3, 4, 5].map((i) => ({ id: i, location_id: i, location_name: i === 1 ? long : `Lokacija ${i}`, due_date: i === 1 ? day(-4) : (i === 2 ? day(0) : (i === 5 ? null : day(i * 3))) })) : (ok ? [] : [{ id: 1, location_id: 1, location_name: 'Lokacija 1', due_date: day(2) }]) },
      vehicles: role === 'technician' ? null : { expiring_soon_count: ok ? 0 : 2, expiring_soon_list: ok ? [] : [{ id: 1, name: 'Renault Kangoo ZG-1234-AB', registration_expiry_date: day(-5).slice(0, 10) }, { id: 2, name: 'Fiat Doblo', registration_expiry_date: day(12).slice(0, 10) }] },
      notifications: { has_rms_alerts: !ok, overdue_work_orders_count: ok ? 0 : 3, rms_coverage_low: !ok },
    }
  }
  if (method === 'POST' && p === '/elevators/qr-labels') {
    let body = {}
    try { body = JSON.parse(url.searchParams.get('__body') || '{}') } catch { /* ignore */ }
    const rows = locations.filter((l) => !body.location_id || l.id === body.location_id).flatMap((l) => l.elevators.filter((e) => !body.elevator_id || e.id === body.elevator_id).map((e) => qrLabel(l, e)))
    return rows
  }
  if (method === 'POST' && (m0 = p.match(/^\/elevators\/(\d+)\/qr-token\/regenerate$/))) {
    const id = Number(m0[1])
    qrGen.set(id, (qrGen.get(id) || 0) + 1)
    qrTokens.delete(id)
    const loc = locations.find((l) => l.elevators.some((e) => e.id === id))
    return qrLabel(loc, loc.elevators.find((e) => e.id === id))
  }
  if ((m0 = p.match(/^\/elevators\/by-qr\/(.+)$/))) {
    for (const loc of locations) for (const e of loc.elevators) {
      if (qrTokenFor(e.id) === decodeURIComponent(m0[1])) {
        return { elevator: { ...e, control_group_type: 'Microprocesor', cabin_door_type: 'Automatska', lock_type: 'Standard', machine_room_key: 'Portir', comment: null, location_id: loc.id, location_name: loc.name, location_address: loc.address },
          history: [{ id: 2, source: 'rms', date: d(3), created_at: d(3), status: 'O.K.', comment: 'Sve uredno' }, { id: 5, source: 'intervention', date: d(9), created_at: d(9), status: 'Potreban popravak - u funkciji', comment: null }],
          open_findings: findingsDb.filter((f) => f.elevator_id === e.id && f.state !== 'resolved').map(stripEvents) }
      }
    }
    return { __status: 404, body: { error: 'QR code not found', code: 'qr_not_found' } }
  }
  if (p === '/locations' || p === '/locations/with-last-activity') return locationsEmpty ? [] : locations
  // share link (share-check.cjs): admin card + PUBLIC page. Token 'EXPIRED...' / 'bad...' answer the identical 404 like the real backend.
  if ((m0 = p.match(/^\/locations\/(\d+)\/share-link$/))) {
    if (role !== 'admin' && role !== 'admin-ok' && role !== 'superadmin') return { __status: 403, body: { error: 'Admin only', code: 'forbidden' } }
    if (method === 'POST') { shareEnabled = true; return { __status: 201, body: { id: 5, token: SHARE_TOKEN, path: `/s/${SHARE_TOKEN}`, expires_at: null } } }
    if (method === 'DELETE') { shareEnabled = false; return { revoked: 1 } }
    return shareEnabled ? { enabled: true, link: { id: 5, created_at: d(2), expires_at: null, expired: false } } : { enabled: false, link: null }
  }
  if ((m0 = p.match(/^\/public\/share\/(.+)$/))) {
    if (decodeURIComponent(m0[1]) !== SHARE_TOKEN) return { __status: 404, body: { error: 'Not found', code: 'share_not_found' } }
    return sharePayload
  }
  if (p === '/locations/all-elevators') return locations.flatMap((l) => l.elevators.map((e) => ({ id: e.id, location_id: l.id, label: e.label, serial_number: e.serial_number || null }))) // offline read cache
  let m
  if ((m = p.match(/^\/locations\/(\d+)$/))) return locations[0]
  if ((m0 = p.match(/^\/locations\/(\d+)\/elevators/))) return (locations.find((l) => l.id === Number(m0[1])) || locations[0]).elevators // each location has its own elevator ids (QR scan test preselects an exact elevator)
  if (p.match(/^\/locations\/\d+\/(rms|interventions|latest|active|status)/)) return p.includes('latest') || p.includes('active') ? {} : (p.includes('interventions') ? [intervention(1)] : rms)
  if (p === '/rms') return rms
  if (p === '/rms/deadlines') return deadlinesFixture || { year: 2026, month: 11, days_in_month: 30, days_left: 6, urgency: 'warning', expected: 3, done: 0, missing_count: 3, overdue_count: 1, missing_locations: locations.map((l) => ({ id: l.id, name: l.name })), overdue_locations: [{ id: locations[0].id, name: locations[0].name, year: 2026, month: 10 }] }
  if (p.match(/^\/rms-visits\/\d+$/)) return { ...(rms[Number(p.split('/').pop()) - 1] || rms[0]), notes_general: 'Opća napomena', signature_status: 'unsigned', items: [{ id: 1, visit_id: 1, elevator_label: 'Lift A', status: 'ok', comment: 'Sve uredno, bez primjedbi' }, { id: 2, visit_id: 1, elevator_label: 'Lift B', status: 'warning', comment: 'Buka u vodilicama' }] }
  // annual RMS overview (rms-overview-check.cjs): location 1 = November with TWO RMS (cell shows the latest, 20th), October with ONE RMS
  // attributed by rms_month, September = manual date without RMS, August empty; location 2 = invoiced June with one RMS
  if (p === '/rms-overview/kpi') return { year: 2026, total_rms: 4, invoiced: 1, not_invoiced: 3 }
  if (p === '/rms-overview/visits') {
    const key = `${url.searchParams.get('location_id')}-${url.searchParams.get('month')}`
    if (ovwVisitsFail) return { __status: 500, body: { error: 'x' } }
    return ovwVisits[key] || []
  }
  if (p === '/rms-overview' && method === 'GET') return locations.map((l) => ({ location_id: l.id, location_name: l.name, months: ovwMonths[l.id] || {} }))
  if (p.startsWith('/rms/monthly-overview') || p.startsWith('/rms-overview')) return locations.map((l, i) => ({ location_id: l.id, location_name: l.name, expected: true, has_rms: i % 2 === 0, late: i === 1, last_rms_visit_date: d(3).slice(0, 10) }))
  if (p === '/interventions') return [1, 2, 3].map(intervention)
  if ((m0 = p.match(/^\/interventions\/by-location\/(\d+)$/))) return [intervention(Number(m0[1]) || 1)]
  if ((m0 = p.match(/^\/interventions\/(\d+)\/photos$/))) return { photos: Number(m0[1]) === 1 ? intPhotos : [] } // intervention-detail-check.cjs: only intervention 1 has photos
  if ((m0 = p.match(/^\/interventions\/(\d+)$/))) return Number(m0[1]) > 3 ? { __status: 404, body: { error: 'Intervention not found', code: 'intervention_not_found' } } : intervention(Number(m0[1]))
  if (p === '/records/filter') {
    let body = {}
    try { body = JSON.parse(url.searchParams.get('__body') || '{}') } catch { /* ignore */ }
    if (body.signature_state || body.type === 'intervencija') return sigRecords(body.type === 'intervencija' ? 'intervention' : 'rms', body)
    return rms.map((r) => ({ ...r, technician: 'Ivan Horvat', items: [{ elevator_label: 'Lift A', comment: 'ok' }], document_name: 'x.pdf', signature_state: sigStateOf('rms', r.id) }))
  }
  if (p === '/reports/awaiting-client') {
    const items = ['rms', 'intervention'].flatMap((type) => [1, 2, 3].filter((i) => sigStateOf(type, i) === 'awaiting_client').map((i) => ({ type, id: i, since: d(4), location_name: locations[i - 1].name })))
    return { count: items.length, oldest_at: items.length ? d(4) : null, items }
  }
  if ((m0 = p.match(/^\/reports\/(rms|intervention)\/(\d+)\/signature$/))) return sigInfo(m0[1], Number(m0[2]))
  if ((m0 = p.match(/^\/reports\/(rms|intervention)\/(\d+)\/verify$/))) return { status: sigVerify, document_number: sigInfo(m0[1], Number(m0[2])).document_number, snapshots: [] }
  if (method === 'POST' && (m0 = p.match(/^\/reports\/(rms|intervention)\/(\d+)\/(client-signature|client-scan|client-declined)$/))) {
    sigStates.set(m0[1] + ':' + m0[2], m0[3] === 'client-declined' ? 'closed_without_client' : 'completed')
    return { id: Number(m0[2]), signature_state: sigStateOf(m0[1], Number(m0[2])) }
  }
  if (p === '/work-orders') return wo
  if (method === 'PUT' && (m0 = p.match(/^\/work-orders\/(\d+)\/items$/))) {
    const id = Number(m0[1])
    let body = {}
    try { body = JSON.parse(url.searchParams.get('__body') || '{}') } catch { /* ignore */ }
    if (!woAssigned && role === 'technician') return { __status: 403, body: { error: 'Forbidden', code: 'forbidden' } }
    if ((wo.find((o) => o.id === id) || wo[0]).status !== 'open') return { __status: 409, body: { error: 'Work order is closed', code: 'work_order_closed' } }
    woLines[id] = (body.work_lines || []).map((l, i) => ({ id: i + 1, position: i + 1, ...l }))
    return { work_lines: woLines[id] }
  }
  if (p.match(/^\/work-orders\/\d+$/)) {
    const o = wo.find((x) => x.id === Number(p.split('/').pop())) || wo[0]
    return { ...o, assigned_users: woAssigned ? [{ id: userId, name: 'Marijana Kovačević' }] : [{ id: 999, name: 'Ivan Horvat' }], work_lines: woLines[o.id] || [] }
  }
  if (p === '/projects') return [project, { ...project, id: 2 }]
  if (p.match(/^\/projects\/\d+$/)) return project
  if (p === '/vehicles') return vehicles
  if (p.match(/^\/companies\/\d+\/users$/)) return users
  if (p === '/users') return users
  if (p === '/users/activity') return { data: [1, 2].map((i) => ({ id: i, user_id: 1, username: 'marijana.kovacevic', action: 'rms.create', entity_type: 'rms', entity_id: i, created_at: d(i) })), total: 2, page: 1, limit: 20 }
  if (p.match(/^\/users\/\d+$/)) return users[0]
  if (p.match(/^\/users\/\d+\/stats$/)) return { rms_last_7_days: 3, rms_last_30_days: 9, interventions_last_7_days: 1, interventions_last_30_days: 4, rmsList: [{ id: 1, date: d(1) }], intList: [{ id: 1, date: d(1) }] }
  if (p.match(/^\/users\/\d+\/rms-latest|interventions-latest/)) return [{ id: 1, lift_id: 1, location_id: 1, created_at: d(1) }]
  if (p === '/sessions') return { sessions: [{ id: 'abcdef123456abcdef123456', user_id: 1, username: 'marijana.kovacevic', ip_address: '192.168.100.200', user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15', created_at: d(1), last_activity: d(0), is_current: true }] }
  if (p === '/settings/session') return { session_timeout_hours: 8 }
  if (p === '/settings/company') return { default_language: language }
  if (p === '/settings/email') return { company_email_enabled: true, smtp_configured: true }
  if (p === '/company/logo' && method === 'POST') { brand.logo_path = '/uploads/company-logos/1-1700000000000-abcdef123456.png'; pushState.calls.push('logo:upload'); return { path: brand.logo_path } }
  if (p === '/company/logo' && method === 'DELETE') { brand.logo_path = null; pushState.calls.push('logo:remove'); return { path: null } }
  if (p === '/company/branding' && method === 'PUT') {
    let accent = null
    try { accent = JSON.parse(url.searchParams.get('__body') || '{}').accent_color ?? null } catch { /* ignore */ }
    if (accent !== null && !/^#[0-9a-fA-F]{6}$/.test(accent)) return { __status: 400, body: { error: 'Accent colour must be a hex value', code: 'invalid_accent_color' } }
    brand.accent = accent ? accent.toUpperCase() : null
    pushState.calls.push('accent:' + brand.accent)
    return { brand_accent_color: brand.accent }
  }
  if (p === '/push/config') return pushState.enabled ? { enabled: true, public_key: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM' } : { enabled: false, public_key: null }
  if (p === '/push/subscribe' && method === 'POST') { pushState.calls.push('subscribe'); return { subscribed: true } }
  if (p === '/push/unsubscribe' && method === 'POST') { pushState.calls.push('unsubscribe'); return { removed: 1 } }
  if (p === '/push/test' && method === 'POST') { pushState.calls.push('test'); return { sent: pushState.testSent, removed: 0, failed: 0 } }
  if (p === '/company') return { id: 1, name: 'Rijeka Dizalo servis d.o.o.', address: 'Ulica 1, Rijeka', contact_person: 'Ivan', contact_phone: '+385', oib: '12345678901', notes: '', logo_path: brand.logo_path, brand_accent_color: brand.accent }
  if (p === '/notifications') return [{ id: 1, title: 'Kašnjenje RMS-a za lokaciju s jako dugim nazivom', body: 'Opis obavijesti koji je prilično dugačak', link: '/dashboard/rms', read_at: null, created_at: d(1) }]
  if (p === '/stats/rms') return { total_locations: 10, expected_rms: 10, done_count: 6, late_count: 2, missing_count: 2, coverage_percent: 60 }
  if (p.match(/^\/superadmin\/companies\/\d+\/.+/) && method === 'POST') return { success: true }
  if (p.match(/^\/superadmin\/companies\/\d+$/)) {
    const row = superadminCompanies.find((c) => c.id === Number(p.split('/').pop())) || superadminCompanies[0]
    const sub = row.subscription ? { ...row.subscription, current_period_start: d(20), stripe_managed: row.id === 3 } : null
    return {
      ...row, subscription: sub, total_elevators: 31,
      closure: row.id === 7 ? { requested_at: d(31), purge_after: d(1), status_before: 'active', purge_due: true } : row.id === 5 ? { requested_at: d(2), purge_after: d(-28), status_before: 'past_due', purge_due: false } : null, plan_limits: { admin: 1, technician: 2 },
      members: [
        { id: 1, email: 'mario.verylongemailaddress@example-company.com', full_name: 'Marijana Kovačević', role: 'admin', is_active: true, disabled_at: null, is_superadmin: false, is_self: false, other_companies: 1, joined_at: d(30), last_login_at: d(1) },
        { id: 3, email: 'rezervni@liftelo.local', full_name: null, role: 'technician', is_active: false, disabled_at: d(3), is_superadmin: false, is_self: false, other_companies: 0, joined_at: d(20), last_login_at: null },
        { id: 7, email: 'owner@liftelo.app', full_name: 'Owner', role: 'viewer', is_active: true, disabled_at: null, is_superadmin: true, is_self: true, other_companies: 0, joined_at: d(5), last_login_at: d(0) },
      ],
      invitations: [{ id: 1, email: 'novi.serviser@primjer.hr', role: 'technician', expires_at: new Date(Date.now() + 5 * 864e5).toISOString(), created_at: d(2) }],
      audit: [
        { id: 3, action: 'superadmin_change_plan', user_id: 7, user_email: 'owner@liftelo.app', created_at: d(1), metadata: { reason: 'Dogovoreno telefonom', before: { plan_code: 'starter', status: 'trial' }, after: { plan_code: 'pro', status: 'active' } } },
        { id: 2, action: 'superadmin_auth_failed', user_id: 7, user_email: 'owner@liftelo.app', created_at: d(1), metadata: { attempted_action: 'suspend' } },
        { id: 1, action: 'login', user_id: 1, user_email: 'mario.verylongemailaddress@example-company.com', created_at: d(2), metadata: null },
      ],
      plans: [{ code: 'starter', name: 'Starter', price_cents: 7900, admin_limit: 1, technician_limit: 2, trial_days: 14 }, { code: 'pro', name: 'Pro', price_cents: 17900, admin_limit: 2, technician_limit: 5, trial_days: 14 }, { code: 'corporate', name: 'Corporate', price_cents: 39900, admin_limit: null, technician_limit: null, trial_days: 14 }],
    }
  }
  if (p === '/superadmin/revenue') return {
    currency: 'EUR',
    summary: { mrr_cents: 57400, mrr_stripe_cents: 39900, mrr_manual_cents: 17500, arr_cents: 688800, paying_companies: 3, free_granted: 1, active_free_plan: 0, trial_active: 3, trial_expired: 1, past_due: 1, suspended: 0, canceled: 2, companies_total: 9, without_subscription: 1 },
    by_plan: [
      { plan_code: 'corporate', plan_name: 'Corporate', price_cents: 39900, total: 1, trial: 0, paying: 1, free_granted: 0, other: 0, mrr_cents: 39900 },
      { plan_code: 'pro', plan_name: 'Pro', price_cents: 17900, total: 3, trial: 1, paying: 1, free_granted: 1, other: 0, mrr_cents: 17900 },
      { plan_code: 'starter', plan_name: 'Starter', price_cents: 7900, total: 5, trial: 2, paying: 1, free_granted: 0, other: 2, mrr_cents: 7900 },
    ],
    upcoming_trials: [{ company_id: 2, company_name: 'Rijeka Dizalo d.o.o. (vrlo dugi naziv tvrtke za provjeru prijeloma)', plan_code: 'starter', trial_ends_at: new Date(Date.now() + 2 * 864e5).toISOString() }, { company_id: 3, company_name: 'Liftservis', plan_code: 'pro', trial_ends_at: new Date(Date.now() + 6 * 864e5).toISOString() }],
    churn: { canceled_last_30_days: 1, canceled_total: 2, basis: 'subscription_updated_at' },
    conversion: { cohort_trials_ended_90d: 4, converted_to_paid: 1, rate: 25, basis: 'current_state' },
  }
  if (p === '/superadmin/health') return {
    generated_at: new Date().toISOString(),
    database: { ok: true, ping_ms: 3 },
    outbox: { available: true, pending: 2, sending: 0, sent: 140, failed: 3, sent_last_24h: 12, failed_last_24h: 1, pending_last_24h: 2, oldest_pending_at: d(1),
      last_failed: [{ id: 9, type: 'invite', company_id: 1, attempts: 3, created_at: d(0), error: 'Connection timeout to smtp host while sending the message, retry later' }, { id: 7, type: 'work_order', company_id: 2, attempts: 10, created_at: d(3), error: null }] },
    billing: { available: true, last_event_at: d(1), last_7_days: { processed: 14, ignored: 2, failed: 1 }, last_failed: [{ id: 3, provider: 'stripe', event_type: 'customer.subscription.updated', processed_at: d(2), error: 'No subscription found for the event' }] },
    uploads: { available: true, files: 1234, bytes: 734003200, truncated: false },
    app: { version: '1.0.0', commit: '36862bc0a1b2', node: 'v20.19.0', env: 'production', uptime_seconds: 190000, started_at: d(2) },
  }
  if (p === '/superadmin/growth') {
    const mon = new Date(); mon.setUTCDate(mon.getUTCDate() - ((mon.getUTCDay() + 6) % 7) - 77)
    const weeks = Array.from({ length: 12 }, (_, i) => { const w = new Date(mon); w.setUTCDate(w.getUTCDate() + i * 7); return { week_start: w.toISOString().slice(0, 10), new_companies: [0, 1, 0, 2, 1, 0, 0, 3, 1, 1, 2, 1][i], new_users: [1, 3, 2, 5, 4, 1, 0, 8, 3, 2, 6, 4][i], active_companies: [2, 3, 3, 4, 5, 4, 4, 6, 6, 7, 7, 8][i] } })
    return { weeks, totals: { new_companies: 12, new_users: 39 } }
  }
  if (p === '/superadmin/audit') {
    const q = url.searchParams
    const all = [
      { id: 90, created_at: d(0), action: 'superadmin_change_plan', user_id: 7, user_email: 'owner@liftelo.app', company_id: 2, company_name: 'Rijeka Dizalo', metadata: { reason: 'Dogovoreno telefonom', before: { plan_code: 'starter', status: 'trial' }, after: { plan_code: 'pro', status: 'active' }, password: '[redacted]' } },
      { id: 89, created_at: d(0), action: 'login', user_id: 1, user_email: 'mario.verylongemailaddress@example-company.com', company_id: 1, company_name: 'Technique d.o.o.', metadata: { ip: '10.0.0.1' } },
      { id: 88, created_at: d(1), action: 'superadmin_auth_failed', user_id: 7, user_email: 'owner@liftelo.app', company_id: 2, company_name: 'Rijeka Dizalo', metadata: { attempted_action: 'suspend' } },
      { id: 87, created_at: d(2), action: 'custom_unknown_action', user_id: null, user_email: null, company_id: null, company_name: null, metadata: null },
    ]
    const rows = q.get('scope') === 'superadmin' ? all.filter((r) => r.action.startsWith('superadmin_')) : all
    return { limit: 25, offset: Number(q.get('offset') || 0), has_more: false, rows, ...(q.get('offset') === '0' ? { actions: ['login', 'superadmin_change_plan', 'superadmin_auth_failed', 'custom_unknown_action'] } : {}) }
  }
  if (p === '/superadmin/companies') return superadminCompanies
  if (p === '/superadmin/stats') return { totalCompanies: 8, totalUsers: 31, totalRms: 40, totalInterventions: 18, byPlan: { starter: 4, pro: 2, corporate: 1, none: 1 }, byStatus: { trial: 3, active: 2, past_due: 1, canceled: 1, none: 1 } }
  if (p.startsWith('/invitations') || p.includes('invite')) return { valid: true, email: 'novi@primjer.hr', company_name: 'Rijeka Dizalo', role: 'technician' }
  return method === 'GET' ? [] : {}
}

const collect = (v) => {
  if (typeof v === 'string') {
    if (v.length >= 3) recorded.add(v)
  } else if (Array.isArray(v)) v.forEach(collect)
  else if (v && typeof v === 'object') Object.values(v).forEach(collect)
}

module.exports = {
  setAuthed: (v) => { authed = v },
  setLocationsEmpty: (v) => { locationsEmpty = v }, // import-check.cjs: a company without locations (first-run guide, empty state)
  setImportApplyFailures: (n) => { importApplyFailures = n },
  importApplies, // import-check.cjs
  setLegalEnabled: (v) => { legalEnabled = v },
  setLegalFail: (v) => { legalFail = v },
  setLegalNeeded: (v) => { legalNeeded = v },
  setExportState: (v) => { exportState = { ...exportState, ...v, files: { ...exportState.files, ...(v.files || {}) } } },
  setUserId: (v) => { userId = v }, // offline-check.cjs: simulate another account on the same device
  resetWorkLines: () => { woLines = seedWoLines(); intLines = seedIntLines(); woAssigned = true },
  setWoAssigned: (v) => { woAssigned = v },
  // one fault raised from intervention 1 (source_type 'intervention'), for intervention-detail-check.cjs; resetFindings() removes it again
  addInterventionFinding: () => { findingsDb.push({ ...seedFindings()[0], id: findingsNextId++, source_type: 'intervention', source_id: 1, description: 'Vrata kabine ne zatvaraju do kraja (iz intervencije).' }) },
  resetFindings: () => { findingsDb = seedFindings(); findingsNextId = 100; findingsFail = false },
  setFindingState: (id, state) => { const f = findingsDb.find((x) => x.id === id); if (f) f.state = state }, // tags-check.cjs: e.g. (5, 'resolved') leaves location 3 without open faults
  setFindingsFail: (v) => { findingsFail = v }, // GET /findings and /findings/by-location answer 500 (tags-check.cjs: the forms must keep working)
  resetShare: () => { shareEnabled = false },
  SHARE_TOKEN,
  resetQr: () => { qrTokens.clear(); qrGen.clear() },
  setLanguage: (v) => { language = v },
  setSearchFail: (v) => { searchFail = v },
  setSearchDelay: (v) => { searchDelayMs = v },
  resetBranding: () => { brand = { logo_path: null, accent: null } }, // branding-check.cjs
  setBrand: (v) => { brand = { ...brand, ...v } },
  resetPush: (enabled = false) => { pushState = { enabled, subscribed: new Set(), calls: [], testSent: 1 } }, // push-check.cjs
  setPushTestSent: (n) => { pushState.testSent = n },
  pushCalls: () => pushState.calls.slice(),
  setOvwVisitsFail: (v) => { ovwVisitsFail = v }, // rms-overview-check.cjs: GET /rms-overview/visits answers 500
  setDeadlines: (v) => { deadlinesFixture = v }, // rms-deadlines-check.cjs: fixture of GET /rms/deadlines (null = default)
  setVerify: (v) => { sigVerify = v },
  setSignatureState: (type, id, state) => { sigStates.set(type + ':' + id, state) }, // intervention-detail-check.cjs: e.g. ('intervention', 2, 'unsigned')
  resetSignatures: () => { sigStates.clear(); sigVerify = 'ok' },
  setUserLanguage: (v) => { userLanguage = v },
  recorded,
  handle: async (route, role) => {
    const req = route.request()
    const url = new URL(req.url())
    if (url.pathname === '/api/company/export' && req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/zip', headers: { 'Content-Disposition': 'attachment; filename="liftelo-export-company-1-20261110.zip"' }, body: 'PK-fake-zip' })
    if (req.resourceType() === 'document' || req.resourceType() === 'script') return route.continue()
    if (url.pathname.startsWith('/api/uploads')) return route.fulfill({ status: 404, body: '' })
    if (req.method() === 'GET' && /^\/api\/import\/template\.(xlsx|csv)$/.test(url.pathname)) {
      const kind = url.pathname.endsWith('.csv') ? 'csv' : 'xlsx'
      return route.fulfill({ status: 200, contentType: kind === 'csv' ? 'text/csv' : 'application/octet-stream', headers: { 'Content-Disposition': `attachment; filename="liftelo-template-${url.searchParams.get('lang')}.${kind}"` }, body: 'PK-fake' })
    }
    if (req.method() === 'POST' && url.pathname.startsWith('/api/import/locations/')) {
      const raw = req.postDataBuffer() ? req.postDataBuffer().toString('latin1') : ''
      url.searchParams.set('__file', /filename="([^"]+)"/.exec(raw)?.[1] || 'ok.xlsx')
      url.searchParams.set('__rid', /name="client_request_id"\r\n\r\n([^\r]+)/.exec(raw)?.[1] || '')
      url.searchParams.set('__warn', /name="include_warnings"\r\n\r\n([^\r]+)/.exec(raw)?.[1] || 'false')
    }
    if (req.method() === 'PUT' && url.pathname === '/api/users/me/language') { try { userLanguage = JSON.parse(req.postData()).language } catch { /* ignore */ } } // like the real backend: the account language is persisted
    if (req.method() === 'POST' && (url.pathname === '/api/elevators/qr-labels' || url.pathname.startsWith('/api/findings'))) url.searchParams.set('__body', req.postData() || '{}')
    if (req.method() === 'PUT' && url.pathname === '/api/company/branding') url.searchParams.set('__body', req.postData() || '{}')
    if (req.method() === 'PUT' && /^\/api\/work-orders\/\d+\/items$/.test(url.pathname)) url.searchParams.set('__body', req.postData() || '{}')
    if (req.method() === 'POST' && (url.pathname === '/api/elevators/qr-labels' || url.pathname === '/api/records/filter')) url.searchParams.set('__body', req.postData() || '{}')
    if (url.pathname === '/api/search' && searchDelayMs) await new Promise((r) => setTimeout(r, searchDelayMs))
    const data = resolve(req.method(), url, role)
    if (data && data.__status) return route.fulfill({ status: data.__status, contentType: 'application/json', body: JSON.stringify(data.body) })
    collect(data)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  },
}
