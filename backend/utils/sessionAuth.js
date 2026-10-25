const db = require('../db');

const resolveUserSessionContext = async (userId) => {
  const [users] = await db.query(
    `SELECT id, email, role, global_role, language, is_active, disabled_at, last_active_company_id
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );

  if (users.length === 0) {
    return null;
  }

  const user = users[0];

  if (user.disabled_at || user.is_active === 0) {
    return {
      error: 'inactive',
      user,
    };
  }

  const [companies] = await db.query(
    `SELECT company_id, role
     FROM user_companies
     WHERE user_id = ?
     ORDER BY company_id ASC`,
    [user.id]
  );

  if (user.global_role !== 'superadmin' && companies.length === 0) {
    return {
      error: 'no_company',
      user,
      companies,
    };
  }

  const preferredCompanyId = Number(user.last_active_company_id) || null;
  const preferredMembership = preferredCompanyId
    ? companies.find((company) => Number(company.company_id) === preferredCompanyId)
    : null;

  const activeCompanyId =
    user.global_role !== 'superadmin'
      ? preferredMembership?.company_id ?? companies[0]?.company_id ?? null
      : preferredMembership?.company_id ?? (companies.length > 0 ? companies[0].company_id : null);

  const activeCompanyRole = activeCompanyId
    ? companies.find((company) => company.company_id === activeCompanyId)?.role || 'technician'
    : null;

  const sessionUser = {
    id: user.id,
    email: user.email,
    role: user.global_role === 'superadmin' ? 'superadmin' : activeCompanyRole || user.role,
    global_role: user.global_role,
    company_id: activeCompanyId,
    language: user.language ?? null,
    is_active: user.is_active,
  };

  return {
    user,
    companies,
    activeCompanyId,
    sessionUser,
  };
};

const establishSessionForUser = async (req, userId) => {
  const context = await resolveUserSessionContext(userId);
  if (!context || context.error) {
    return context;
  }

  await new Promise((resolve, reject) => {
    req.session.regenerate((regenerateErr) => {
      if (regenerateErr) {
        reject(regenerateErr);
        return;
      }

      req.session.user_id = context.user.id;
      req.session.user_email = context.user.email;
      req.session.active_company_id = context.activeCompanyId;
      req.session.global_role = context.user.global_role;
      req.session.user = context.sessionUser;

      req.session.save((saveErr) => {
        if (saveErr) {
          reject(saveErr);
          return;
        }
        resolve(null);
      });
    });
  });

  if (context.activeCompanyId) {
    try {
      await db.query('UPDATE users SET last_active_company_id = ? WHERE id = ? LIMIT 1', [context.activeCompanyId, context.user.id]);
    } catch (err) {
      console.error('Failed to update last active company in session setup:', err);
    }
  }

  return context;
};

module.exports = {
  resolveUserSessionContext,
  establishSessionForUser,
};
