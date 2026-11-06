const db = require('../db');
const { logAudit } = require('./auditLog');

// Personal data of ONE user: (a) the data subject's own export ("download my data") and (b) anonymisation of a leaver.
// Design (docs/decisions.md 2026-11-10): the records of a company belong to the company (controller) and stay; the PERSON is
// anonymised instead of the records being deleted. rms_visits / rms_visit_items / interventions are never deleted. The only
// change to existing intervention rows is one narrowly scoped UPDATE of the text columns technician / second_technician
// (they hold the user NAME as text, not an id), done once per anonymisation, inside the same transaction, audit-logged.

const ANONYMIZED_EMAIL_DOMAIN = 'anonymized.invalid';
const ROW_CAP = 5000;
const AUDIT_CAP = 1000;

const isMissingTable = (err) => err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146);

const anonymizedLabels = (userId) => ({
  username: `removed-user-${userId}`,
  email: `removed-user-${userId}@${ANONYMIZED_EMAIL_DOMAIN}`,
  fullName: `Former user #${userId}`,
});

const isAnonymizedEmail = (email) => typeof email === 'string' && email.toLowerCase().endsWith(`@${ANONYMIZED_EMAIL_DOMAIN}`);

class PrivacyError extends Error {
  constructor(status, error, code, extra = {}) {
    super(error);
    this.status = status;
    this.body = { error, code, ...extra };
  }
}

// ------------------------------------------------------------------------------------------------ (a) own data export
// Every query is filtered by company_id of one of the user's own memberships (or by the user's own id for tables that are
// per user). Dates are returned as plain strings. Password hashes, tokens and provider ids are never included.
const buildPersonalDataExport = async (userId) => {
  const q = async (sql, values) => {
    try {
      const [rows] = await db.query({ sql, values, dateStrings: true });
      return rows;
    } catch (err) {
      if (isMissingTable(err)) return [];
      throw err;
    }
  };

  const [user] = await q(
    'SELECT id, username, full_name, email, language, created_at, is_active, global_role FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  if (!user) return null;

  const memberships = await q(
    `SELECT uc.company_id, c.name AS company_name, uc.role, uc.created_at AS joined_at
     FROM user_companies uc INNER JOIN companies c ON c.id = uc.company_id
     WHERE uc.user_id = ? ORDER BY uc.company_id ASC`,
    [userId]
  );
  const names = [...new Set([user.username, user.full_name].filter(Boolean))];
  const nameA = names[0] ?? null;
  const nameB = names[1] ?? names[0] ?? null;

  const activity = { rms_visits: [], interventions: [], work_orders_created_or_closed: [], work_orders_assigned: [], projects: [], project_tasks_assigned: [], project_comments: [] };
  for (const { company_id: companyId } of memberships) {
    activity.rms_visits.push(...await q(
      `SELECT id, company_id, location_id, visit_date, rms_month, notes_general, status, signature_status, signed_by_user_id, signed_at, created_at
       FROM rms_visits WHERE company_id = ? AND (user_id = ? OR signed_by_user_id = ?) ORDER BY created_at DESC LIMIT ${ROW_CAP}`,
      [companyId, userId, userId]
    ));
    activity.interventions.push(...await q(
      `SELECT id, company_id, date, type, technician, second_technician, description, notes, status, location_id, signed_by_user_id, signed_at, created_at
       FROM interventions
       WHERE company_id = ? AND (technician IN (?, ?) OR second_technician IN (?, ?) OR signed_by_user_id = ?)
       ORDER BY created_at DESC LIMIT ${ROW_CAP}`,
      [companyId, nameA, nameB, nameA, nameB, userId]
    ));
    activity.work_orders_created_or_closed.push(...await q(
      `SELECT id, company_id, location_id, status, due_date, issued_date, created_at, closed_at
       FROM work_orders WHERE company_id = ? AND (created_by_user_id = ? OR closed_by_user_id = ?) ORDER BY created_at DESC LIMIT ${ROW_CAP}`,
      [companyId, userId, userId]
    ));
    activity.work_orders_assigned.push(...await q(
      'SELECT work_order_id, company_id, created_at FROM work_order_users WHERE company_id = ? AND user_id = ? ORDER BY id ASC LIMIT 5000',
      [companyId, userId]
    ));
    activity.projects.push(...await q(
      `SELECT id, company_id, name, status, start_date, expected_end_date, created_at
       FROM projects WHERE company_id = ? AND (created_by = ? OR owner_user_id = ?) ORDER BY created_at DESC LIMIT ${ROW_CAP}`,
      [companyId, userId, userId]
    ));
    activity.project_tasks_assigned.push(...await q(
      `SELECT pt.id, p.company_id, pt.title, pt.is_completed, pt.completed_at, pt.created_at
       FROM project_tasks pt
       INNER JOIN project_sections ps ON ps.id = pt.project_section_id
       INNER JOIN projects p ON p.id = ps.project_id
       WHERE p.company_id = ? AND pt.assigned_user_id = ? ORDER BY pt.id ASC LIMIT ${ROW_CAP}`,
      [companyId, userId]
    ));
    activity.project_comments.push(...await q(
      'SELECT id, company_id, task_id, comment, created_at FROM project_task_comments WHERE company_id = ? AND user_id = ? ORDER BY id ASC LIMIT 5000',
      [companyId, userId]
    ));
  }

  const signInMethods = await q(
    'SELECT provider, email_at_link_time, created_at FROM user_identities WHERE user_id = ? ORDER BY created_at ASC',
    [userId]
  );
  const legalAcceptances = await q(
    'SELECT document, version, method, company_id, accepted_at FROM legal_acceptances WHERE user_id = ? ORDER BY id ASC',
    [userId]
  );
  const notifications = await q(
    'SELECT id, type, title, message, link, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1000',
    [userId]
  );
  const auditRows = await q(
    `SELECT id, company_id, action, metadata, created_at FROM audit_logs WHERE user_id = ? ORDER BY id DESC LIMIT ${AUDIT_CAP}`,
    [userId]
  );
  const audit = auditRows.map((row) => {
    let metadata = row.metadata;
    if (typeof metadata === 'string') {
      try { metadata = JSON.parse(metadata); } catch { /* keep the raw text */ }
    }
    return { ...row, metadata };
  });

  return {
    format: 'liftelo-personal-data',
    format_version: 1,
    generated_at: new Date().toISOString(),
    note: 'Your own personal data held by Liftelo. Records of a company (visits, interventions, ...) belong to that company; only the entries where you appear are listed. Password hashes and tokens are never included.',
    profile: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      language: user.language,
      created_at: user.created_at,
      is_active: Boolean(user.is_active),
      is_platform_admin: user.global_role === 'superadmin',
    },
    memberships,
    sign_in_methods: signInMethods,
    legal_acceptances: legalAcceptances,
    activity,
    notifications,
    audit_log: { limit: AUDIT_CAP, entries: audit },
  };
};

// ------------------------------------------------------------------------------------------------ (b) anonymise a leaver
const MAX_METADATA_ROWS = 5000;
const SENSITIVE_AUDIT_KEYS = ['email', 'target_email', 'ip', 'user_agent', 'full_name', 'username'];

// Replaces the person with an anonymous placeholder but keeps the account row (id) and every business record.
// `actor` must already be verified as an ADMIN of `companyId` (route layer).
const anonymizeUser = async ({ companyId, actorId, targetId }) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[target]] = await conn.query(
      `SELECT u.id, u.username, u.full_name, u.email, u.is_active, u.global_role, uc.role
       FROM user_companies uc INNER JOIN users u ON u.id = uc.user_id
       WHERE uc.company_id = ? AND uc.user_id = ?
       LIMIT 1 FOR UPDATE`,
      [companyId, targetId]
    );
    if (!target) throw new PrivacyError(404, 'User not found in company', 'user_not_found');
    if (target.id === actorId) throw new PrivacyError(400, 'You cannot erase your own account here', 'cannot_anonymize_self');
    if (target.global_role === 'superadmin') throw new PrivacyError(403, 'Forbidden', 'forbidden');
    if (isAnonymizedEmail(target.email)) throw new PrivacyError(409, 'User is already anonymised', 'already_anonymized');

    const [[others]] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM user_companies WHERE user_id = ? AND company_id <> ?',
      [targetId, companyId]
    );
    if (Number(others.cnt) > 0) {
      throw new PrivacyError(409, 'The user is a member of other companies; remove the membership instead', 'user_in_other_companies');
    }

    if (target.role === 'admin') {
      const [[admins]] = await conn.query(
        `SELECT COUNT(*) AS cnt FROM user_companies uc INNER JOIN users u ON u.id = uc.user_id
         WHERE uc.company_id = ? AND uc.role = 'admin' AND u.is_active = 1 AND u.id <> ?`,
        [companyId, targetId]
      );
      if (Number(admins.cnt) === 0) throw new PrivacyError(409, 'The last admin of the company cannot be erased', 'last_admin');
    }

    const label = anonymizedLabels(targetId);
    const oldNames = [...new Set([target.username, target.full_name].filter(Boolean))];

    // 1. the account: keeps its id, loses name / e-mail / password / invite data and can never sign in again
    await conn.query(
      `UPDATE users
       SET username = ?, full_name = ?, email = ?, password = '', password_hash = NULL, is_active = 0, disabled_at = NOW(),
           invite_token = NULL, invite_expires = NULL, language = NULL
       WHERE id = ? LIMIT 1`,
      [label.username, label.fullName, label.email, targetId]
    );

    // 2. sign-in identities (Google / Apple / local), password reset tokens, own notifications
    await conn.query('DELETE FROM user_identities WHERE user_id = ?', [targetId]);
    await conn.query('DELETE FROM password_resets WHERE user_id = ?', [targetId]);
    await conn.query('DELETE FROM notifications WHERE user_id = ?', [targetId]);
    await conn.query('DELETE FROM email_outbox WHERE company_id = ? AND user_id = ?', [companyId, targetId]);

    // 3. the old e-mail address in invitations of this company
    let invitationsScrubbed = 0;
    if (target.email) {
      const [inv] = await conn.query('UPDATE invitations SET email = ? WHERE company_id = ? AND email = ?', [label.email, companyId, target.email]);
      invitationsScrubbed = inv.affectedRows;
    }

    // 4. interventions store the technician NAME as text: replace exactly this person's name in exactly the two name
    //    columns, only in this company's rows. Nothing else of any intervention is touched (INSERT-only otherwise).
    let interventionsUpdated = 0;
    if (oldNames.length > 0) {
      const [r1] = await conn.query(
        `UPDATE interventions SET technician = ? WHERE company_id = ? AND technician IN (${oldNames.map(() => '?').join(', ')})`,
        [label.fullName, companyId, ...oldNames]
      );
      const [r2] = await conn.query(
        `UPDATE interventions SET second_technician = ? WHERE company_id = ? AND second_technician IN (${oldNames.map(() => '?').join(', ')})`,
        [label.fullName, companyId, ...oldNames]
      );
      interventionsUpdated = r1.affectedRows + r2.affectedRows;
    }

    // 5. e-mail / IP / names inside the audit trail of this user (the rows themselves stay as security records)
    const [auditRows] = await conn.query(
      'SELECT id, metadata FROM audit_logs WHERE user_id = ? AND metadata IS NOT NULL ORDER BY id ASC LIMIT ?',
      [targetId, MAX_METADATA_ROWS]
    );
    let auditScrubbed = 0;
    for (const row of auditRows) {
      let meta = row.metadata;
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch { continue; }
      }
      if (!meta || typeof meta !== 'object') continue;
      let changed = false;
      for (const key of SENSITIVE_AUDIT_KEYS) {
        if (key in meta) { delete meta[key]; changed = true; }
      }
      if (changed) {
        await conn.query('UPDATE audit_logs SET metadata = ? WHERE id = ? AND user_id = ? LIMIT 1', [JSON.stringify(meta), row.id, targetId]);
        auditScrubbed += 1;
      }
    }

    // 6. sessions of the user (best effort; the is_active check also logs a live session out on its next request)
    try {
      await conn.query('DELETE FROM sessions WHERE data LIKE ? OR data LIKE ?', [`%"user_id":${Number(targetId)},%`, `%"user_id":${Number(targetId)}}%`]);
    } catch (err) {
      if (!isMissingTable(err)) throw err;
    }

    // the audit entry carries ids and counts only, never the erased name / e-mail
    await logAudit({
      userId: actorId,
      companyId,
      action: 'user_anonymized',
      metadata: {
        target_user_id: targetId,
        previous_role: target.role,
        interventions_updated: interventionsUpdated,
        invitations_scrubbed: invitationsScrubbed,
        audit_rows_scrubbed: auditScrubbed,
      },
      connection: conn,
      throwOnError: true,
    });

    await conn.commit();
    return { interventions_updated: interventionsUpdated, invitations_scrubbed: invitationsScrubbed, audit_rows_scrubbed: auditScrubbed };
  } catch (err) {
    try { await conn.rollback(); } catch (rollbackErr) { console.error('Anonymise rollback failed:', rollbackErr); }
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = {
  ANONYMIZED_EMAIL_DOMAIN,
  PrivacyError,
  anonymizedLabels,
  isAnonymizedEmail,
  buildPersonalDataExport,
  anonymizeUser,
};
