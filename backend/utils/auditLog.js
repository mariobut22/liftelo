const db = require('../db');

// `connection` (optional): write through an open transaction connection so the audit row commits/rolls back with the change.
// `throwOnError`: do not swallow insert failures (used by superadmin actions, which must not succeed without an audit row).
async function logAudit({ userId = null, companyId = null, action, metadata = null, connection = null, throwOnError = false }) {
  if (!action) return;
  try {
    const metaValue = metadata ? JSON.stringify(metadata) : null;
    await (connection || db).query(
      `INSERT INTO audit_logs (user_id, company_id, action, metadata)
       VALUES (?, ?, ?, ?)`,
      [userId, companyId, action, metaValue]
    );
  } catch (err) {
    if (throwOnError) throw err;
    console.error('Audit log insert failed:', err);
  }
}

module.exports = { logAudit };
