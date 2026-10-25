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

module.exports = {
  getCompanyRole,
  isCompanyAdmin,
};
