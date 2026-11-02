const db = require('../db');

const normalizeSubscription = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    company_id: row.company_id,
    status: row.status,
    trial_ends_at: row.trial_ends_at,
    current_period_start: row.current_period_start,
    current_period_end: row.current_period_end,
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
    seats_override: row.seats_override,
    admin_limit_override: row.admin_limit_override ?? null,
    technician_limit_override: row.technician_limit_override ?? null,
    stripe_customer_id: row.stripe_customer_id || null,
    stripe_subscription_id: row.stripe_subscription_id || null,
    plan: {
      id: row.plan_id,
      code: row.plan_code,
      name: row.plan_name,
      billing_interval: row.billing_interval,
      price_cents: row.price_cents,
      seats_included: row.seats_included,
      admin_limit: row.admin_limit ?? null,
      technician_limit: row.technician_limit ?? null,
      trial_days: row.trial_days,
      stripe_price_id: row.stripe_price_id || null,
      is_active: Boolean(row.plan_is_active),
    },
  };
};

const getCompanySubscription = async (companyId) => {
  const [rows] = await db.query(
    `SELECT cs.id,
            cs.company_id,
            cs.plan_id,
            cs.status,
            cs.trial_ends_at,
            cs.current_period_start,
            cs.current_period_end,
            cs.cancel_at_period_end,
            cs.seats_override,
            cs.admin_limit_override,
            cs.technician_limit_override,
            cs.stripe_customer_id,
            cs.stripe_subscription_id,
            sp.code AS plan_code,
            sp.name AS plan_name,
            sp.billing_interval,
            sp.price_cents,
            sp.seats_included,
            sp.admin_limit,
            sp.technician_limit,
            sp.trial_days,
            sp.stripe_price_id,
            sp.is_active AS plan_is_active
     FROM company_subscriptions cs
     INNER JOIN subscription_plans sp ON sp.id = cs.plan_id
     WHERE cs.company_id = ?
     LIMIT 1`,
    [companyId]
  );

  return normalizeSubscription(rows[0]);
};

const ensureCompanySubscription = async (companyId) => {
  const existing = await getCompanySubscription(companyId);
  if (existing) {
    return existing;
  }

  const [[starterPlan]] = await db.query(
    `SELECT id, trial_days
     FROM subscription_plans
     WHERE code = 'starter'
     LIMIT 1`
  );

  if (!starterPlan) {
    throw new Error('Starter plan is missing');
  }

  const trialDays = Number(starterPlan.trial_days) > 0 ? Number(starterPlan.trial_days) : 7;

  await db.query(
    `INSERT INTO company_subscriptions
      (company_id, plan_id, status, trial_started_at, trial_ends_at, current_period_start, current_period_end)
     VALUES (?, ?, 'trial', NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), NOW(), DATE_ADD(NOW(), INTERVAL ? DAY))
     ON DUPLICATE KEY UPDATE company_id = VALUES(company_id)`,
    [companyId, starterPlan.id, trialDays, trialDays]
  );

  return getCompanySubscription(companyId);
};

const getCompanyUsage = async (companyId) => {
  const [[usage]] = await db.query(
    `SELECT
      COUNT(*) AS active_members,
      SUM(CASE WHEN uc.role = 'admin' THEN 1 ELSE 0 END) AS admins,
      SUM(CASE WHEN uc.role = 'technician' THEN 1 ELSE 0 END) AS technicians
     FROM user_companies uc
     INNER JOIN users u ON u.id = uc.user_id
     WHERE uc.company_id = ?
       AND u.is_active = 1`,
    [companyId]
  );

  return {
    active_members: Number(usage?.active_members || 0),
    admins: Number(usage?.admins || 0),
    technicians: Number(usage?.technicians || 0),
  };
};

// Roles that count against plan limits. Viewers are unlimited and never counted.
const LIMITED_ROLES = ['admin', 'technician'];

const toLimit = (value) => (value === null || value === undefined ? null : Number(value));

// Effective limit per role: company override wins, otherwise plan limit. null = unlimited.
const getRoleLimits = (subscription) => ({
  admin: toLimit(subscription?.admin_limit_override ?? subscription?.plan?.admin_limit),
  technician: toLimit(subscription?.technician_limit_override ?? subscription?.plan?.technician_limit),
});

const getPendingInvitesByRole = async (companyId, { excludeInviteId = null } = {}) => {
  const [rows] = await db.query(
    `SELECT role, COUNT(*) AS cnt
     FROM invitations
     WHERE company_id = ?
       AND status = 'pending'
       AND expires_at > NOW()
       AND (? IS NULL OR id <> ?)
     GROUP BY role`,
    [companyId, excludeInviteId, excludeInviteId]
  );
  const result = { admin: 0, technician: 0, viewer: 0, total: 0 };
  for (const row of rows) {
    const count = Number(row.cnt || 0);
    result.total += count;
    if (row.role in result) result[row.role] = count;
  }
  return result;
};

const getSeatSummary = async (companyId) => {
  const subscription = await ensureCompanySubscription(companyId);
  const usage = await getCompanyUsage(companyId);
  const pending = await getPendingInvitesByRole(companyId);
  const limits = getRoleLimits(subscription);

  const remaining = (limit, used, reserved) => (limit === null ? null : Math.max(0, limit - used - reserved));
  const adminsRemaining = remaining(limits.admin, usage.admins, pending.admin);
  const techniciansRemaining = remaining(limits.technician, usage.technicians, pending.technician);

  return {
    subscription,
    usage,
    admin_limit: limits.admin,
    technician_limit: limits.technician,
    pending_invites: pending.total,
    pending_admin_invites: pending.admin,
    pending_technician_invites: pending.technician,
    admins_remaining: adminsRemaining,
    technicians_remaining: techniciansRemaining,
    can_add_admin: adminsRemaining === null || adminsRemaining > 0,
    can_add_technician: techniciansRemaining === null || techniciansRemaining > 0,
  };
};

// Checks whether one more member with `role` fits into the plan.
// excludeInviteId: the invite being accepted (it is already counted as reserved).
const checkRoleCapacity = async (companyId, role, { excludeInviteId = null } = {}) => {
  if (!LIMITED_ROLES.includes(role)) {
    return { allowed: true, role, limit: null, used: 0, reserved: 0 };
  }

  const subscription = await ensureCompanySubscription(companyId);
  const usage = await getCompanyUsage(companyId);
  const pending = await getPendingInvitesByRole(companyId, { excludeInviteId });
  const limit = getRoleLimits(subscription)[role];
  const used = role === 'admin' ? usage.admins : usage.technicians;
  const reserved = pending[role];

  return {
    allowed: limit === null || used + reserved < limit,
    role,
    limit,
    used,
    reserved,
    plan_name: subscription?.plan?.name || null,
  };
};

const ROLE_LIMIT_LABELS = { admin: 'admina', technician: 'servisera' };

// Body for a 409 response when a role limit blocks adding a member.
const roleLimitErrorBody = (capacity) => ({
  error: `Dosegnut je limit ${ROLE_LIMIT_LABELS[capacity.role] || capacity.role} za plan ${capacity.plan_name || ''}`.trim()
    + ` (${capacity.used + capacity.reserved}/${capacity.limit}). Nadogradite plan za dodavanje novih.`,
  code: 'role_limit_reached',
  role: capacity.role,
  limit: capacity.limit,
  used: capacity.used,
  pending_invites: capacity.reserved,
});

module.exports = {
  getCompanySubscription,
  ensureCompanySubscription,
  getCompanyUsage,
  getSeatSummary,
  checkRoleCapacity,
  roleLimitErrorBody,
};
