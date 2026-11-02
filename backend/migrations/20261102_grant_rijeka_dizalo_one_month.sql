-- ONE-OFF, STAGING ONLY: give the company/companies of the account info@rijeka-dizalo.hr
-- a paid-equivalent, fully unlimited Corporate subscription for one month from the day this is run.
-- Matches the account by email OR username; company via user_companies OR users.company_id.
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
    WHERE LOWER(u.email) = 'info@rijeka-dizalo.hr' OR LOWER(u.username) = 'info@rijeka-dizalo.hr'
    UNION
    SELECT u.company_id
    FROM users u
    WHERE (LOWER(u.email) = 'info@rijeka-dizalo.hr' OR LOWER(u.username) = 'info@rijeka-dizalo.hr')
      AND u.company_id IS NOT NULL
  ) AS target
);

-- Diagnostics (read-only): matching users
SELECT id, username, email, company_id, role, is_active FROM users
WHERE LOWER(email) LIKE '%rijeka%' OR LOWER(username) LIKE '%rijeka%';

-- Resulting subscription state of the matched account's companies
SELECT c.id, c.name, sp.code AS plan, cs.status, cs.current_period_start, cs.current_period_end,
       cs.admin_limit_override, cs.technician_limit_override
FROM companies c
LEFT JOIN company_subscriptions cs ON cs.company_id = c.id
LEFT JOIN subscription_plans sp ON sp.id = cs.plan_id
WHERE LOWER(c.name) LIKE '%rijeka%';
