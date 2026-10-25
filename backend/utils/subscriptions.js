const db = require('../db');

const normalizeSubscription = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    company_id: row.company_id,
    status: row.status,
    trial_ends_at: row.trial_ends_at,
    current_period_end: row.current_period_end,
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
    seats_override: row.seats_override,
    plan: {
      id: row.plan_id,
      code: row.plan_code,
      name: row.plan_name,
      billing_interval: row.billing_interval,
      price_cents: row.price_cents,
      seats_included: row.seats_included,
      trial_days: row.trial_days,
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
            cs.current_period_end,
            cs.cancel_at_period_end,
            cs.seats_override,
            sp.code AS plan_code,
            sp.name AS plan_name,
            sp.billing_interval,
            sp.price_cents,
            sp.seats_included,
            sp.trial_days,
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

  const trialDays = Number(starterPlan.trial_days) > 0 ? Number(starterPlan.trial_days) : 14;

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

module.exports = {
  getCompanySubscription,
  ensureCompanySubscription,
  getCompanyUsage,
};
