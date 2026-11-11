-- New subscription plans: per-role limits (admin / technician), Corporate plan, 7-day trial
-- Safe for repeated runs on MySQL 8.4 (information_schema checks, no ADD COLUMN IF NOT EXISTS)
-- NULL limit = unlimited. Viewers are not counted and are unlimited.
-- seats_included / seats_override are kept but no longer used.
-- trial_ends_at of existing subscriptions is NOT touched.

-- subscription_plans.admin_limit
SET @col_exists := (
  SELECT COUNT(1) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'subscription_plans' AND column_name = 'admin_limit'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE subscription_plans ADD COLUMN admin_limit INT NULL AFTER seats_included',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- subscription_plans.technician_limit
SET @col_exists := (
  SELECT COUNT(1) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'subscription_plans' AND column_name = 'technician_limit'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE subscription_plans ADD COLUMN technician_limit INT NULL AFTER admin_limit',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- company_subscriptions.admin_limit_override (NULL = use plan limit)
SET @col_exists := (
  SELECT COUNT(1) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'company_subscriptions' AND column_name = 'admin_limit_override'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE company_subscriptions ADD COLUMN admin_limit_override INT NULL AFTER seats_override',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- company_subscriptions.technician_limit_override (NULL = use plan limit)
SET @col_exists := (
  SELECT COUNT(1) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'company_subscriptions' AND column_name = 'technician_limit_override'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE company_subscriptions ADD COLUMN technician_limit_override INT NULL AFTER admin_limit_override',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Plans: Starter 29 EUR (1 admin + 2 technicians), Pro 59 EUR (2 + 5), Corporate 119 EUR (unlimited)
UPDATE subscription_plans
SET name = 'Starter', billing_interval = 'monthly', price_cents = 2900,
    admin_limit = 1, technician_limit = 2, trial_days = 7, is_active = 1
WHERE code = 'starter';

UPDATE subscription_plans
SET name = 'Pro', billing_interval = 'monthly', price_cents = 5900,
    admin_limit = 2, technician_limit = 5, trial_days = 7, is_active = 1
WHERE code = 'pro';

INSERT INTO subscription_plans
  (code, name, billing_interval, price_cents, seats_included, admin_limit, technician_limit, trial_days, is_active)
SELECT 'corporate', 'Corporate', 'monthly', 11900, 0, NULL, NULL, 7, 1
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE code = 'corporate');

UPDATE subscription_plans
SET name = 'Corporate', billing_interval = 'monthly', price_cents = 11900,
    admin_limit = NULL, technician_limit = NULL, trial_days = 7, is_active = 1
WHERE code = 'corporate';

-- Grandfathering: any company currently above its plan's limit keeps its current count as an override.
-- Only sets overrides that are still NULL, so re-running changes nothing.
UPDATE company_subscriptions cs
INNER JOIN subscription_plans sp ON sp.id = cs.plan_id
INNER JOIN (
  SELECT uc.company_id,
         SUM(CASE WHEN uc.role = 'admin' THEN 1 ELSE 0 END) AS admins,
         SUM(CASE WHEN uc.role = 'technician' THEN 1 ELSE 0 END) AS technicians
  FROM user_companies uc
  INNER JOIN users u ON u.id = uc.user_id
  WHERE u.is_active = 1
  GROUP BY uc.company_id
) cnt ON cnt.company_id = cs.company_id
SET cs.admin_limit_override = CASE
      WHEN cs.admin_limit_override IS NULL AND sp.admin_limit IS NOT NULL AND cnt.admins > sp.admin_limit
      THEN cnt.admins ELSE cs.admin_limit_override END,
    cs.technician_limit_override = CASE
      WHEN cs.technician_limit_override IS NULL AND sp.technician_limit IS NOT NULL AND cnt.technicians > sp.technician_limit
      THEN cnt.technicians ELSE cs.technician_limit_override END;

-- Resulting state (read-only, shown in the run log)
SELECT id, code, name, price_cents, seats_included, admin_limit, technician_limit, trial_days, is_active
FROM subscription_plans ORDER BY price_cents;

SELECT cs.company_id, sp.code AS plan, cs.status, cs.trial_ends_at,
       cs.admin_limit_override, cs.technician_limit_override
FROM company_subscriptions cs
INNER JOIN subscription_plans sp ON sp.id = cs.plan_id
ORDER BY cs.company_id;
