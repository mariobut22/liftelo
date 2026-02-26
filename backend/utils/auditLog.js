const db = require('../db');

async function logAudit({ userId = null, companyId = null, action, metadata = null }) {
  if (!action) return;
  try {
    const metaValue = metadata ? JSON.stringify(metadata) : null;
    await db.query(
      `INSERT INTO audit_logs (user_id, company_id, action, metadata)
       VALUES (?, ?, ?, ?)`,
      [userId, companyId, action, metaValue]
    );
  } catch (err) {
    console.error('Audit log insert failed:', err);
  }
}

module.exports = { logAudit };
