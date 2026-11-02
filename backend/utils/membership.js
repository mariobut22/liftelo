const db = require('../db');

const getCompanyRole = async (userId, companyId) => {
  if (!userId || !companyId) {
    return null;
  }

  const [[row]] = await db.query(
    'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
    [userId, companyId]
  );

  return row?.role || null;
};

const isCompanyAdmin = async ({ userId, companyId, globalRole }) => {
  if (globalRole === 'superadmin') {
    return true;
  }

  const role = await getCompanyRole(userId, companyId);
  return role === 'admin';
};

// The single company a user works in while multi-company is disabled:
// their home company (users.company_id) if still a member, otherwise the lowest company id.
const getPrimaryMembership = async (userId) => {
  if (!userId) return null;
  const [[row]] = await db.query(
    `SELECT uc.company_id, uc.role
     FROM user_companies uc
     INNER JOIN users u ON u.id = uc.user_id
     WHERE uc.user_id = ?
     ORDER BY (uc.company_id = u.company_id) DESC, uc.company_id ASC
     LIMIT 1`,
    [userId]
  );
  return row || null;
};

module.exports = {
  getPrimaryMembership,
  getCompanyRole,
  isCompanyAdmin,
};
