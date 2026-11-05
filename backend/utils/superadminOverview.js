const { getAccessState, getRoleLimits, normalizeSubscription } = require('./subscriptions');

// One row per company, no multi-table fan-out join:
//  - subscription + plan: 1:1 LEFT JOINs (company_subscriptions.company_id is UNIQUE)
//  - members: one grouped derived table over user_companies (active users only, same rule as getCompanyUsage)
//  - totals / last activity: correlated subqueries that use the (company_id) indexes
// No parameters needed: the query is not tenant-scoped (superadmin sees all companies) and takes no user input.
const COMPANY_OVERVIEW_SQL = `
  SELECT c.id,
         c.name,
         c.created_at,
         cs.id AS subscription_id,
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
         sp.is_active AS plan_is_active,
         COALESCE(m.admins, 0) AS usage_admins,
         COALESCE(m.technicians, 0) AS usage_technicians,
         COALESCE(m.viewers, 0) AS usage_viewers,
         COALESCE(m.members, 0) AS usage_members,
         (SELECT COUNT(*) FROM locations l WHERE l.company_id = c.id) AS total_locations,
         (SELECT COUNT(*) FROM rms_visits rv WHERE rv.company_id = c.id) AS total_rms,
         (SELECT COUNT(*) FROM interventions i WHERE i.company_id = c.id) AS total_interventions,
         (SELECT COUNT(*) FROM work_orders wo WHERE wo.company_id = c.id) AS total_work_orders,
         (SELECT MAX(rv.created_at) FROM rms_visits rv WHERE rv.company_id = c.id) AS last_rms_at,
         (SELECT MAX(i.created_at) FROM interventions i WHERE i.company_id = c.id) AS last_intervention_at,
         (SELECT MAX(wo.created_at) FROM work_orders wo WHERE wo.company_id = c.id) AS last_work_order_at,
         (SELECT MAX(al.created_at) FROM audit_logs al
           WHERE al.company_id = c.id AND al.action IN ('login', 'login_google', 'login_apple')) AS last_login_at
  FROM companies c
  LEFT JOIN company_subscriptions cs ON cs.company_id = c.id
  LEFT JOIN subscription_plans sp ON sp.id = cs.plan_id
  LEFT JOIN (
    SELECT uc.company_id,
           COUNT(*) AS members,
           SUM(uc.role = 'admin') AS admins,
           SUM(uc.role = 'technician') AS technicians,
           SUM(uc.role = 'viewer') AS viewers
    FROM user_companies uc
    INNER JOIN users u ON u.id = uc.user_id
    WHERE u.is_active = 1
    GROUP BY uc.company_id
  ) m ON m.company_id = c.id
  ORDER BY c.created_at DESC, c.id DESC`;

const toIso = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const latest = (...values) => {
  let best = null;
  for (const value of values) {
    if (!value) continue;
    const time = (value instanceof Date ? value : new Date(value)).getTime();
    if (!Number.isNaN(time) && (best === null || time > best)) best = time;
  }
  return best === null ? null : new Date(best).toISOString();
};

// Maps one SQL row to the API payload. Never exposes Stripe ids (only has_stripe).
// Keeps the old keys (id, name, created_at, subscription_status, total_*) for backwards compatibility.
const mapCompanyOverviewRow = (row) => {
  const subscription = row.subscription_id ? normalizeSubscription({ ...row, id: row.subscription_id, company_id: row.id }) : null;
  const limits = getRoleLimits(subscription);
  const access = getAccessState(subscription);

  return {
    id: row.id,
    name: row.name,
    created_at: toIso(row.created_at),
    // real status from company_subscriptions (null = no subscription row); the legacy companies.subscription_status column is no longer read
    subscription_status: subscription ? subscription.status : null,
    subscription_plan: subscription ? subscription.plan.code : null,
    subscription: subscription
      ? {
          status: subscription.status,
          plan_code: subscription.plan.code,
          plan_name: subscription.plan.name,
          price_cents: subscription.plan.price_cents === null || subscription.plan.price_cents === undefined
            ? null
            : Number(subscription.plan.price_cents),
          trial_ends_at: toIso(subscription.trial_ends_at),
          current_period_end: toIso(subscription.current_period_end),
          cancel_at_period_end: subscription.cancel_at_period_end,
          has_stripe: Boolean(subscription.stripe_customer_id),
        }
      : null,
    limits: {
      admin: limits.admin,
      technician: limits.technician,
      admin_override: subscription ? subscription.admin_limit_override !== null : false,
      technician_override: subscription ? subscription.technician_limit_override !== null : false,
    },
    usage: {
      admins: Number(row.usage_admins || 0),
      technicians: Number(row.usage_technicians || 0),
      viewers: Number(row.usage_viewers || 0),
    },
    access,
    total_users: Number(row.usage_members || 0),
    total_locations: Number(row.total_locations || 0),
    total_rms: Number(row.total_rms || 0),
    total_interventions: Number(row.total_interventions || 0),
    total_work_orders: Number(row.total_work_orders || 0),
    // latest of: RMS / intervention / work-order creation and a user login recorded in audit_logs for this company
    last_activity_at: latest(row.last_rms_at, row.last_intervention_at, row.last_work_order_at, row.last_login_at),
    last_login_at: toIso(row.last_login_at),
  };
};

module.exports = { COMPANY_OVERVIEW_SQL, mapCompanyOverviewRow };
