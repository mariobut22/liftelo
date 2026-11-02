-- ONE-OFF, STAGING ONLY: give the company/companies where info@rijeka-dizalo.hr is admin
-- a paid-equivalent, fully unlimited Corporate subscription for one month from the day this is run.
-- Do NOT run on production. Re-running simply restarts the month from the run date.
-- Stripe fields are not touched.

UPDATE company_subscriptions cs
INNER JOIN subscription_plans sp ON sp.code = 'corporate'
SET cs.plan_id = sp.id,
    cs.status = 'active',
    cs.cancel_at_period_end = 0,
    cs.current_period_start = NOW(),
    cs.current_period_end = DATE_ADD(NOW(), INTERVAL 1 MONTH),
    cs.admin_limit_override = NULL,
    cs.technician_limit_override = NULL,
    cs.seats_override = NULL
WHERE cs.company_id IN (
  SELECT company_id FROM (
    SELECT uc.company_id
    FROM user_companies uc
    INNER JOIN users u ON u.id = uc.user_id
    WHERE LOWER(u.email) = 'info@rijeka-dizalo.hr'
      AND uc.role = 'admin'
  ) AS target
);

-- Resulting state (read-only, shown in the run log)
SELECT c.id, c.name, u.email, uc.role, sp.code AS plan, cs.status, cs.current_period_start, cs.current_period_end,
       cs.admin_limit_override, cs.technician_limit_override
FROM users u
INNER JOIN user_companies uc ON uc.user_id = u.id
INNER JOIN companies c ON c.id = uc.company_id
LEFT JOIN company_subscriptions cs ON cs.company_id = c.id
LEFT JOIN subscription_plans sp ON sp.id = cs.plan_id
WHERE LOWER(u.email) = 'info@rijeka-dizalo.hr';
