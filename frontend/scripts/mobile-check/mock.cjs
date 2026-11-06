/* Fake API for the mobile harness. Unknown GETs return []; unknown writes return {}. */
let authed = true
let legalNeeded = false // /api/legal/status: true = the signed-in user still has to accept the Terms/Privacy (legal-check.cjs)
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
const user = (role) => ({ id: 1, username: role === 'superadmin' ? 'superadmin' : 'marijana.kovacevic', email: 'mario.verylongemailaddress@example-company.com', role, global_role: role === 'superadmin' ? 'superadmin' : 'user', is_active: 1, full_name: 'Marijana Kovačević', company_id: 1, language: userLanguage === undefined ? language : userLanguage, status: 'active', created_at: d(30), last_login: d(1) })
const plan = { id: 2, code: 'pro', name: 'Pro', billing_interval: 'monthly', price_cents: 5900, seats_included: 7, admin_limit: 2, technician_limit: 5, trial_days: 7 }
const billing = { company_id: 1, access: { locked: false, reason: null }, subscription: { id: 1, company_id: 1, status: 'active', trial_ends_at: null, current_period_end: d(-20), cancel_at_period_end: false, seats_override: null, admin_limit_override: null, technician_limit_override: null, plan }, usage: { active_members: 3, admins: 1, technicians: 2, admin_limit: 2, technician_limit: 5, pending_invites: 0, pending_admin_invites: 0, pending_technician_invites: 0, admins_remaining: 1, technicians_remaining: 3, can_add_admin: true, can_add_technician: true } }
const rms = [1, 2, 3].map((i) => ({ id: i, location_id: i, location_name: locations[i - 1].name, visit_date: d(i).slice(0, 10), rms_month: d(i).slice(0, 10), created_at: d(i), status: i === 2 ? 'warning' : 'ok', technician_name: 'Ivan Horvat', pdf_available: true, date: d(i) }))
const wo = [1, 2].map((i) => ({ id: i, location_id: i, location_name: locations[i - 1].name, issued_date: d(5), due_date: d(-3), status: i === 1 ? 'open' : 'completed', comment: 'Zamjena kontaktora u strojarnici', general_comment: 'Komentar', created_at: d(i), assigned_users: ['Ivan Horvat', 'Marko Perić'],
  items: [{ id: 1, text: 'Provjeriti vrata kabine', description: 'Provjeriti vrata kabine', is_completed: false }], elevators: [{ id: 11, label: 'Lift A' }], assigned_users_detail: [] }))
const vehicles = [1, 2].map((i) => ({ id: i, name: i === 1 ? 'Renault Kangoo ZG-1234-AB' : 'Fiat Doblo', year: 2019, last_registration_date: '2025-05-01', registration_expiry_date: '2026-05-01', image_path: null }))
const project = { id: 1, name: 'Modernizacija dizala zgrada Vukovarska', description: 'Opis projekta s dugim tekstom koji se mora prelomiti u više redova na malom ekranu', status: 'active', location_id: 1, location_name: locations[0].name, start_date: d(10), expected_end_date: d(-30), due_date: d(-30), created_at: d(10), progress_percent: 40, assigned_users: ['Ivan Horvat'], owner: { id: 1, full_name: 'Marijana Kovačević' },
  sections: [{ id: 1, title: 'Priprema', tasks: [{ id: 1, title: 'Naručiti materijal', description: 'x', is_completed: false, assigned_users: [{ id: 1, full_name: 'Ivan Horvat' }], comments: [{ id: 1, comment: 'ok', created_at: d(1), user: { id: 1, full_name: 'Ivan' } }] }] }], attachments: [] }
const users = [1, 2, 3].map((i) => ({ id: i, username: `korisnik${i}`, email: `korisnik.s.dugim.emailom${i}@primjer-tvrtke.hr`, role: ['admin', 'technician', 'viewer'][i - 1], is_active: 1, full_name: `Korisnik ${i}`, status: 'active', created_at: d(30), last_login: d(1) }))
const intervention = (i) => ({ id: i, location_id: i, location_name: locations[i - 1].name, visit_date: d(i).slice(0, 10), date: d(i), status: 'ok', created_at: d(i), pdf_available: true, technician: 'Ivan Horvat', notes: 'Napomena', items: [{ id: 1, elevator_label: 'Lift A', comment: 'ok' }] })


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

// role: admin | superadmin | technician | admin-ok (admin with nothing needing attention on the home page)
function resolve(method, url, scenario) {
  let m0
  const viewer = scenario === 'viewer'
  const role = scenario === 'admin-ok' ? 'admin' : viewer ? 'technician' : scenario
  const p = url.pathname.replace(/^\/api/, '')
  if (p === '/login/check') return authed ? { user: user(role) } : { user: null }
  if (p === '/users/companies') return [{ id: 1, name: 'Rijeka Dizalo servis d.o.o.', role: viewer ? 'viewer' : role === 'technician' ? 'technician' : 'admin' }, { id: 2, name: 'Technique d.o.o.', role: 'technician' }]
  if (p === '/legal/status' || (method === 'POST' && p === '/legal/accept')) {
    if (method === 'POST') legalNeeded = false
    return { versions: { terms: '2026-11-draft', privacy: '2026-11-draft' }, accepted: { terms: !legalNeeded, privacy: !legalNeeded }, needs_acceptance: legalNeeded }
  }
  if (p === '/billing/current') return billing
  if (p === '/billing/plans') return [plan, { ...plan, id: 1, code: 'starter', name: 'Starter', price_cents: 2900 }, { ...plan, id: 3, code: 'corporate', name: 'Corporate', price_cents: 11900, admin_limit: null, technician_limit: null }]
  if (p === '/home/summary') {
    const ok = scenario === 'admin-ok'
    const day = (n) => new Date(Date.now() + n * 864e5).toISOString()
    const missingLocs = ok ? [] : [...locations.map((l) => ({ id: l.id, name: l.name })), ...[4, 5, 6, 7].map((i) => ({ id: i, name: `Zgrada ${i} - Ulica Ivana Mažuranića` }))]
    return {
      user: { id: 1, name: 'Marijana' }, user_stats: { rms_count: 12, intervention_count: 4 },
      rms_summary: ok ? { expected: 10, done: 10, late: 0, missing: 0 } : { expected: 10, done: 6, late: 2, missing: 2 },
      rms_missing_locations: missingLocs, alerts: { count: ok ? 0 : 2 },
      work_orders: { open_assigned_count: role === 'technician' ? 7 : (ok ? 0 : 2), items: role === 'technician' ? [1, 2, 3, 4, 5].map((i) => ({ id: i, location_id: i, location_name: i === 1 ? long : `Lokacija ${i}`, due_date: i === 1 ? day(-4) : (i === 5 ? null : day(i * 3)) })) : (ok ? [] : [{ id: 1, location_id: 1, location_name: 'Lokacija 1', due_date: day(2) }]) },
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
          history: [{ id: 2, source: 'rms', date: d(3), created_at: d(3), status: 'O.K.', comment: 'Sve uredno' }, { id: 5, source: 'intervention', date: d(9), created_at: d(9), status: 'Potreban popravak - u funkciji', comment: null }] }
      }
    }
    return { __status: 404, body: { error: 'QR code not found', code: 'qr_not_found' } }
  }
  if (p === '/locations' || p === '/locations/with-last-activity') return locations
  let m
  if ((m = p.match(/^\/locations\/(\d+)$/))) return locations[0]
  if (p.match(/^\/locations\/\d+\/elevators/)) return locations[0].elevators
  if (p.match(/^\/locations\/\d+\/(rms|interventions|latest|active|status)/)) return p.includes('latest') || p.includes('active') ? {} : (p.includes('interventions') ? [intervention(1)] : rms)
  if (p === '/rms') return rms
  if (p.match(/^\/rms-visits\/\d+$/)) return { ...rms[0], notes_general: 'Opća napomena', signature_status: 'unsigned', items: [{ id: 1, visit_id: 1, elevator_label: 'Lift A', status: 'ok', comment: 'Sve uredno, bez primjedbi' }, { id: 2, visit_id: 1, elevator_label: 'Lift B', status: 'warning', comment: 'Buka u vodilicama' }] }
  if (p.startsWith('/rms/monthly-overview') || p.startsWith('/rms-overview')) return locations.map((l, i) => ({ location_id: l.id, location_name: l.name, expected: true, has_rms: i % 2 === 0, late: i === 1, last_rms_visit_date: d(3).slice(0, 10) }))
  if (p === '/interventions') return [1, 2, 3].map(intervention)
  if (p.match(/^\/interventions\/\d+$/)) return intervention(1)
  if (p === '/records/filter') return rms.map((r) => ({ ...r, technician: 'Ivan Horvat', items: [{ elevator_label: 'Lift A', comment: 'ok' }], document_name: 'x.pdf' }))
  if (p === '/work-orders') return wo
  if (p.match(/^\/work-orders\/\d+$/)) return wo[0]
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
  if (p === '/company') return { id: 1, name: 'Rijeka Dizalo servis d.o.o.', address: 'Ulica 1, Rijeka', contact_person: 'Ivan', contact_phone: '+385', oib: '12345678901', notes: '' }
  if (p === '/notifications') return [{ id: 1, title: 'Kašnjenje RMS-a za lokaciju s jako dugim nazivom', body: 'Opis obavijesti koji je prilično dugačak', link: '/dashboard/rms', read_at: null, created_at: d(1) }]
  if (p === '/stats/rms') return { total_locations: 10, expected_rms: 10, done_count: 6, late_count: 2, missing_count: 2, coverage_percent: 60 }
  if (p.match(/^\/superadmin\/companies\/\d+\/.+/) && method === 'POST') return { success: true }
  if (p.match(/^\/superadmin\/companies\/\d+$/)) {
    const row = superadminCompanies.find((c) => c.id === Number(p.split('/').pop())) || superadminCompanies[0]
    const sub = row.subscription ? { ...row.subscription, current_period_start: d(20), stripe_managed: row.id === 3 } : null
    return {
      ...row, subscription: sub, total_elevators: 31, plan_limits: { admin: 1, technician: 2 },
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
  setLegalNeeded: (v) => { legalNeeded = v },
  resetQr: () => { qrTokens.clear(); qrGen.clear() },
  setLanguage: (v) => { language = v },
  setUserLanguage: (v) => { userLanguage = v },
  recorded,
  handle: async (route, role) => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.resourceType() === 'document' || req.resourceType() === 'script') return route.continue()
    if (url.pathname.startsWith('/api/uploads')) return route.fulfill({ status: 404, body: '' })
    if (req.method() === 'PUT' && url.pathname === '/api/users/me/language') { try { userLanguage = JSON.parse(req.postData()).language } catch { /* ignore */ } } // like the real backend: the account language is persisted
    if (req.method() === 'POST' && url.pathname === '/api/elevators/qr-labels') url.searchParams.set('__body', req.postData() || '{}')
    const data = resolve(req.method(), url, role)
    if (data && data.__status) return route.fulfill({ status: data.__status, contentType: 'application/json', body: JSON.stringify(data.body) })
    collect(data)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  },
}
