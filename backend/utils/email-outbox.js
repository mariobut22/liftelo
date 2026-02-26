const db = require('../db');

async function enqueueEmail({ companyId, userId, toEmail, subject, html, text, type }) {
  if (!companyId || !toEmail || !subject || !html || !type) {
    return;
  }

  await db.query(
    `INSERT INTO email_outbox (company_id, user_id, to_email, subject, html, text, type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [companyId, userId || null, toEmail, subject, html, text || null, type]
  );
}

async function claimPendingEmails({ workerId, limit }) {
  await db.query(
    `UPDATE email_outbox
     SET status = 'sending',
         locked_at = NOW(),
         locked_by = ?,
         attempts = attempts + 1
     WHERE status IN ('pending','failed')
       AND next_attempt_at <= NOW()
       AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL 10 MINUTE)
     ORDER BY next_attempt_at ASC
     LIMIT ?`,
    [workerId, limit]
  );

  const [rows] = await db.query(
    `SELECT id, company_id, user_id, to_email, subject, html, text, type, attempts
     FROM email_outbox
     WHERE status = 'sending' AND locked_by = ?
     ORDER BY locked_at ASC`,
    [workerId]
  );

  return rows;
}

async function markEmailSent(id) {
  await db.query(
    `UPDATE email_outbox
     SET status = 'sent', sent_at = NOW(), last_error = NULL
     WHERE id = ?`,
    [id]
  );
}

async function markEmailFailed(id, errorMessage, attempts) {
  const cappedDelay = Math.min(Math.pow(2, attempts), 60);
  const nextAttempt = attempts >= 10 ? 1440 : cappedDelay;
  await db.query(
    `UPDATE email_outbox
     SET status = 'failed',
         last_error = ?,
         next_attempt_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
     WHERE id = ?`,
    [errorMessage, nextAttempt, id]
  );
}

module.exports = {
  enqueueEmail,
  claimPendingEmails,
  markEmailSent,
  markEmailFailed
};
