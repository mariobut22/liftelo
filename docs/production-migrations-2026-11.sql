-- ==============================================================================================
-- Liftelo: sve produkcijske migracije za veliko izdanje (develop -> main), redom. Generirano iz backend/migrations/.
-- PRIJE POKRETANJA: backup baze i backend/uploads. Pokreće Mario ručno (npr. phpMyAdmin / mysql klijent).
-- Sve su aditivne i sigurne za ponovno pokretanje (testirano dvaput zaredom). NE sadrži 20261102_grant_rijeka_dizalo_one_month.sql.
-- Redoslijed je bitan: 20261102 postavlja cijene 29/59/119 i trial 7, a 20261106 ih odmah postavlja na 79/179/399 i 14 dana.
-- Na kraju datoteke su upiti za provjeru (očekivano: 7900/17900/39900, trial 14).
-- ==============================================================================================

-- ---------------------------------------------------------------------------------------------
-- >>> 20260302_add_company_default_language.sql
-- ---------------------------------------------------------------------------------------------
-- Add companies.default_language with default 'hr' (idempotent)
-- Safe for repeated runs

SET @column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'default_language'
);

SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE companies ADD COLUMN default_language VARCHAR(5) NOT NULL DEFAULT ''hr''',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verification
-- 1) Column exists
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'companies'
  AND COLUMN_NAME = 'default_language';

-- 2) Sample values
SELECT id, name, default_language FROM companies ORDER BY id ASC LIMIT 10;

SELECT 'OK: 20260302_add_company_default_language.sql' AS migration_done;

-- ---------------------------------------------------------------------------------------------
-- >>> 20260307_add_user_language.sql
-- ---------------------------------------------------------------------------------------------
-- Add user language preference (users.language VARCHAR(5) NULL)
-- Safe for repeated runs on MySQL 8.4 (information_schema check, no ADD COLUMN IF NOT EXISTS)
SET @col_exists := (
  SELECT COUNT(1) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'language'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN language VARCHAR(5) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Optional validation query
SELECT id, email, language FROM users LIMIT 5;

SELECT 'OK: 20260307_add_user_language.sql' AS migration_done;

-- ---------------------------------------------------------------------------------------------
-- >>> 20261025_add_company_profile_fields.sql
-- ---------------------------------------------------------------------------------------------
-- Add optional company profile fields used by dashboard/settings
-- Safe for repeated runs

SET @address_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'address'
);

SET @ddl := IF(
  @address_exists = 0,
  'ALTER TABLE companies ADD COLUMN address VARCHAR(255) NULL AFTER logo_path',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @contact_person_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'contact_person'
);

SET @ddl := IF(
  @contact_person_exists = 0,
  'ALTER TABLE companies ADD COLUMN contact_person VARCHAR(255) NULL AFTER address',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @contact_phone_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'contact_phone'
);

SET @ddl := IF(
  @contact_phone_exists = 0,
  'ALTER TABLE companies ADD COLUMN contact_phone VARCHAR(100) NULL AFTER contact_person',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @oib_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'oib'
);

SET @ddl := IF(
  @oib_exists = 0,
  'ALTER TABLE companies ADD COLUMN oib VARCHAR(32) NULL AFTER contact_phone',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @notes_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'notes'
);

SET @ddl := IF(
  @notes_exists = 0,
  'ALTER TABLE companies ADD COLUMN notes TEXT NULL AFTER oib',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verification
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'companies'
  AND COLUMN_NAME IN ('address', 'contact_person', 'contact_phone', 'oib', 'notes')
ORDER BY FIELD(COLUMN_NAME, 'address', 'contact_person', 'contact_phone', 'oib', 'notes');

SELECT 'OK: 20261025_add_company_profile_fields.sql' AS migration_done;

-- ---------------------------------------------------------------------------------------------
-- >>> 20261025_add_users_last_active_company.sql
-- ---------------------------------------------------------------------------------------------
-- Persist user workspace preference for multi-company continuity
-- Safe for repeated runs

SET @column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'last_active_company_id'
);

SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE users ADD COLUMN last_active_company_id INT NULL AFTER company_id',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill from current company_id where possible
UPDATE users u
LEFT JOIN companies c ON c.id = u.company_id
SET u.last_active_company_id = u.company_id
WHERE u.last_active_company_id IS NULL
  AND u.company_id IS NOT NULL
  AND c.id IS NOT NULL;

-- Verification
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME = 'last_active_company_id';

SELECT 'OK: 20261025_add_users_last_active_company.sql' AS migration_done;

-- ---------------------------------------------------------------------------------------------
-- >>> 20261025_add_user_identities.sql
-- ---------------------------------------------------------------------------------------------
-- Identity provider foundation for Google/Apple login rollout
-- Safe for repeated runs

CREATE TABLE IF NOT EXISTS user_identities (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  provider ENUM('local', 'google', 'apple') NOT NULL,
  provider_sub VARCHAR(255) NULL,
  email_at_link_time VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_provider (user_id, provider),
  UNIQUE KEY uq_provider_sub (provider, provider_sub),
  CONSTRAINT fk_user_identities_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO user_identities (user_id, provider, provider_sub, email_at_link_time)
SELECT u.id, 'local', NULL, u.email
FROM users u
LEFT JOIN user_identities ui ON ui.user_id = u.id AND ui.provider = 'local'
WHERE ui.id IS NULL;

-- Verification
SELECT provider, COUNT(*) AS identities_count
FROM user_identities
GROUP BY provider
ORDER BY provider;

SELECT 'OK: 20261025_add_user_identities.sql' AS migration_done;

-- ---------------------------------------------------------------------------------------------
-- >>> 20261025_add_subscriptions_foundation.sql
-- ---------------------------------------------------------------------------------------------
-- Subscription foundation for SaaS rollout
-- Safe for repeated runs

CREATE TABLE IF NOT EXISTS subscription_plans (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  billing_interval ENUM('monthly', 'yearly') NOT NULL DEFAULT 'monthly',
  price_cents INT NOT NULL DEFAULT 0,
  seats_included INT NOT NULL DEFAULT 1,
  trial_days INT NOT NULL DEFAULT 14,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS company_subscriptions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  company_id INT NOT NULL,
  plan_id INT NOT NULL,
  status ENUM('trial', 'active', 'past_due', 'canceled', 'suspended') NOT NULL DEFAULT 'trial',
  trial_started_at DATETIME NULL,
  trial_ends_at DATETIME NULL,
  current_period_start DATETIME NULL,
  current_period_end DATETIME NULL,
  cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0,
  seats_override INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_company_subscriptions_company (company_id),
  CONSTRAINT fk_company_subscriptions_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_company_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
);

INSERT INTO subscription_plans (code, name, billing_interval, price_cents, seats_included, trial_days, is_active)
SELECT 'starter', 'Starter', 'monthly', 0, 3, 14, 1
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_plans WHERE code = 'starter'
);

INSERT INTO subscription_plans (code, name, billing_interval, price_cents, seats_included, trial_days, is_active)
SELECT 'pro', 'Pro', 'monthly', 2900, 10, 14, 1
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_plans WHERE code = 'pro'
);

INSERT INTO company_subscriptions (
  company_id,
  plan_id,
  status,
  trial_started_at,
  trial_ends_at,
  current_period_start,
  current_period_end
)
SELECT
  c.id,
  p.id,
  'trial',
  NOW(),
  DATE_ADD(NOW(), INTERVAL p.trial_days DAY),
  NOW(),
  DATE_ADD(NOW(), INTERVAL p.trial_days DAY)
FROM companies c
INNER JOIN subscription_plans p ON p.code = 'starter'
LEFT JOIN company_subscriptions cs ON cs.company_id = c.id
WHERE cs.id IS NULL;

-- Verification
SELECT id, code, name, seats_included, trial_days, is_active FROM subscription_plans ORDER BY id;
SELECT company_id, status, trial_ends_at FROM company_subscriptions ORDER BY company_id;

SELECT 'OK: 20261025_add_subscriptions_foundation.sql' AS migration_done;

-- ---------------------------------------------------------------------------------------------
-- >>> 20261027_add_stripe_billing_mvp.sql
-- ---------------------------------------------------------------------------------------------
-- Stripe billing MVP foundation
-- Safe for repeated runs on MySQL 8.x (no ADD COLUMN IF NOT EXISTS; checks via information_schema)

-- subscription_plans.stripe_price_id
SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_plans'
    AND column_name = 'stripe_price_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE subscription_plans ADD COLUMN stripe_price_id VARCHAR(255) NULL AFTER trial_days',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- company_subscriptions.stripe_customer_id
SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'company_subscriptions'
    AND column_name = 'stripe_customer_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE company_subscriptions ADD COLUMN stripe_customer_id VARCHAR(255) NULL AFTER seats_override',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- company_subscriptions.stripe_subscription_id
SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'company_subscriptions'
    AND column_name = 'stripe_subscription_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE company_subscriptions ADD COLUMN stripe_subscription_id VARCHAR(255) NULL AFTER stripe_customer_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS billing_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  provider VARCHAR(32) NOT NULL,
  provider_event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  status ENUM('processed', 'ignored', 'failed') NOT NULL DEFAULT 'processed',
  payload_json LONGTEXT NULL,
  error_message TEXT NULL,
  processed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_billing_events_provider_event (provider, provider_event_id)
);

-- unique index on subscription_plans.stripe_price_id
SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_plans'
    AND index_name = 'uq_subscription_plans_stripe_price_id'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE subscription_plans ADD UNIQUE KEY uq_subscription_plans_stripe_price_id (stripe_price_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Resulting state (read-only, shown in the run log)
SELECT table_name, column_name, column_type, is_nullable
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'subscription_plans' AND column_name = 'stripe_price_id')
    OR (table_name = 'company_subscriptions' AND column_name IN ('stripe_customer_id', 'stripe_subscription_id'))
    OR table_name = 'billing_events')
ORDER BY table_name, ordinal_position;

SELECT 'OK: 20261027_add_stripe_billing_mvp.sql' AS migration_done;

-- ---------------------------------------------------------------------------------------------
-- >>> 20261102_update_subscription_plans_role_limits.sql
-- ---------------------------------------------------------------------------------------------
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

SELECT 'OK: 20261102_update_subscription_plans_role_limits.sql' AS migration_done;

-- ---------------------------------------------------------------------------------------------
-- >>> 20261105_superadmin_overview_indexes.sql
-- ---------------------------------------------------------------------------------------------
-- Indexes for the superadmin companies overview (GET /api/superadmin/companies):
-- per-company MAX(created_at) / member counts become index lookups instead of scanning all rows of a company.
-- Safe for repeated runs (each index is created only when missing).

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_companies' AND INDEX_NAME = 'idx_user_companies_company'
);
SET @ddl := IF(@idx_exists = 0, 'CREATE INDEX idx_user_companies_company ON user_companies (company_id, user_id)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND INDEX_NAME = 'idx_rms_visits_company_created'
);
SET @ddl := IF(@idx_exists = 0, 'CREATE INDEX idx_rms_visits_company_created ON rms_visits (company_id, created_at)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND INDEX_NAME = 'idx_interventions_company_created'
);
SET @ddl := IF(@idx_exists = 0, 'CREATE INDEX idx_interventions_company_created ON interventions (company_id, created_at)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_orders' AND INDEX_NAME = 'idx_work_orders_company_created'
);
SET @ddl := IF(@idx_exists = 0, 'CREATE INDEX idx_work_orders_company_created ON work_orders (company_id, created_at)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs' AND INDEX_NAME = 'idx_audit_logs_company_action_created'
);
SET @ddl := IF(@idx_exists = 0, 'CREATE INDEX idx_audit_logs_company_action_created ON audit_logs (company_id, action, created_at)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT TABLE_NAME, INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME IN ('idx_user_companies_company','idx_rms_visits_company_created','idx_interventions_company_created','idx_work_orders_company_created','idx_audit_logs_company_action_created')
GROUP BY TABLE_NAME, INDEX_NAME;

SELECT 'OK: 20261105_superadmin_overview_indexes.sql' AS migration_done;

-- ---------------------------------------------------------------------------------------------
-- >>> 20261106_update_plan_prices_trial14.sql
-- ---------------------------------------------------------------------------------------------
-- Decision 2026-11-02: new prices (EUR, monthly) and 14-day trial.
-- Starter 79 EUR, Pro 179 EUR, Corporate 399 EUR. Limits are unchanged.
-- Safe to re-run. File name sorts AFTER 20261102_update_subscription_plans_role_limits.sql on purpose: applying migrations in
-- alphabetical order must end with 79/179/399 and 14 days (re-running the older file alone would reset prices to 29/59/119 and trial to 7 days).
-- Renamed 2026-11-06 from 20261102_update_plan_prices_trial14.sql (already applied on staging; the content is unchanged and idempotent).
-- Existing company trials (trial_ends_at) are NOT changed; stripe_price_id is not touched.

UPDATE subscription_plans SET price_cents = 7900,  trial_days = 14 WHERE code = 'starter';
UPDATE subscription_plans SET price_cents = 17900, trial_days = 14 WHERE code = 'pro';
UPDATE subscription_plans SET price_cents = 39900, trial_days = 14 WHERE code = 'corporate';

-- Resulting state (read-only, shown in the run log)
SELECT id, code, name, price_cents, admin_limit, technician_limit, trial_days, stripe_price_id, is_active
FROM subscription_plans ORDER BY price_cents;

SELECT 'OK: 20261106_update_plan_prices_trial14.sql' AS migration_done;

-- ---------------------------------------------------------------------------------------------
-- >>> 20261107_superadmin_monitoring_indexes.sql
-- ---------------------------------------------------------------------------------------------
-- Superadmin phase 3 (monitoring): index for the audit log viewer (date range / newest first) and the weekly
-- growth chart (audit_logs by created_at). Safe to re-run. MySQL 8.4.
SET @idx_exists := (
  SELECT COUNT(1) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs' AND INDEX_NAME = 'idx_audit_logs_created'
);
SET @ddl := IF(@idx_exists = 0, 'CREATE INDEX idx_audit_logs_created ON audit_logs (created_at, id)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT TABLE_NAME, INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME = 'idx_audit_logs_created'
GROUP BY TABLE_NAME, INDEX_NAME;

SELECT 'OK: 20261107_superadmin_monitoring_indexes.sql' AS migration_done;

-- ---------------------------------------------------------------------------------------------
-- >>> 20261108_elevators_qr_token.sql
-- ---------------------------------------------------------------------------------------------
-- QR labels for elevators: opaque per-elevator token (NULL until an admin first generates labels; created lazily by the app,
-- never from the numeric id). Safe to re-run. MySQL 8.4.
SET @col_exists := (
  SELECT COUNT(1) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'elevators' AND COLUMN_NAME = 'qr_token'
);
SET @ddl := IF(@col_exists = 0, 'ALTER TABLE elevators ADD COLUMN qr_token VARCHAR(64) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(1) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'elevators' AND INDEX_NAME = 'uq_elevators_qr_token'
);
SET @ddl := IF(@idx_exists = 0, 'CREATE UNIQUE INDEX uq_elevators_qr_token ON elevators (qr_token)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'elevators' AND COLUMN_NAME = 'qr_token';

SELECT 'OK: 20261108_elevators_qr_token.sql' AS migration_done;

-- ---------------------------------------------------------------------------------------------
-- >>> 20261109_intervention_photos.sql
-- ---------------------------------------------------------------------------------------------
-- Intervention photos (photo pipeline): one INSERT-only row per photo with caption, before/after tag, size, dimensions.
-- New table only; interventions.uploaded_files (comma separated, legacy photos) is left untouched and still shown.
-- Safe to re-run (CREATE TABLE IF NOT EXISTS). MySQL 8.4. Apply to staging with the staging-migrate workflow AFTER the deploy of
-- the commit finished; production is run by Mario after a backup.
CREATE TABLE IF NOT EXISTS intervention_photos (
  id BIGINT NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  intervention_id INT NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  mime VARCHAR(50) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  width SMALLINT UNSIGNED NULL,
  height SMALLINT UNSIGNED NULL,
  kind ENUM('before','after','other') NOT NULL DEFAULT 'other',
  caption VARCHAR(255) NULL,
  taken_at DATETIME NULL,
  client_request_id VARCHAR(64) NULL,
  uploaded_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_intervention_photos_company_intervention (company_id, intervention_id, created_at),
  UNIQUE KEY uq_intervention_photos_request (company_id, intervention_id, client_request_id),
  CONSTRAINT fk_intervention_photos_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_intervention_photos_intervention FOREIGN KEY (intervention_id) REFERENCES interventions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT TABLE_NAME, TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'intervention_photos';

SELECT 'OK: 20261109_intervention_photos.sql' AS migration_done;

-- ---------------------------------------------------------------------------------------------
-- >>> 20261110_legal_acceptances.sql
-- ---------------------------------------------------------------------------------------------
-- Proof of acceptance of the Terms of Service / Privacy Policy (one row per user, document and version).
-- Data-minimal on purpose: NO IP address and NO user agent are stored. INSERT-only evidence table; no FK to users/companies so the
-- rows survive the anonymisation of a user (the user id then only points to an anonymised account).
-- Safe to re-run (CREATE TABLE IF NOT EXISTS). MySQL 8.4. Apply to staging with the staging-migrate workflow AFTER the deploy of
-- the commit finished; production is run by Mario after a backup. Until it is applied the app keeps working: signup then logs
-- a warning instead of recording, and /api/legal/status reports needs_acceptance=false.
CREATE TABLE IF NOT EXISTS legal_acceptances (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  company_id INT NULL,
  document VARCHAR(20) NOT NULL,
  version VARCHAR(40) NOT NULL,
  method VARCHAR(20) NOT NULL,
  accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_legal_acceptances_user (user_id, document, version),
  KEY idx_legal_acceptances_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'legal_acceptances';

SELECT 'OK: 20261110_legal_acceptances.sql' AS migration_done;

-- ---------------------------------------------------------------------------------------------
-- >>> 20261111_offline_client_request_id.sql
-- ---------------------------------------------------------------------------------------------
-- Offline-tolerant entry: idempotent creates. The app sends a client_request_id (UUID) with every new RMS visit and
-- intervention and re-sends the SAME id when it retries after a lost connection; (company_id, client_request_id) is
-- UNIQUE, so a retry returns the stored record instead of inserting a duplicate. NULL ids (old clients) never collide.
-- Records stay append-only: only a nullable column + a unique index are added; nothing is updated or deleted.
-- Safe to re-run (information_schema + PREPARE; no ADD COLUMN IF NOT EXISTS). MySQL 8.4.
-- Apply to staging with the staging-migrate workflow AFTER the deploy of the commit finished; production is run by
-- Mario after a backup. Without the migration the app keeps working (the backend skips idempotency until the column exists).

-- rms_visits.client_request_id
SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rms_visits ADD COLUMN client_request_id VARCHAR(64) NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND COLUMN_NAME = 'client_request_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rms_visits ADD UNIQUE KEY uq_rms_visits_company_request (company_id, client_request_id)',
  'SELECT 1') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND INDEX_NAME = 'uq_rms_visits_company_request');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- interventions.client_request_id
SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions ADD COLUMN client_request_id VARCHAR(64) NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND COLUMN_NAME = 'client_request_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions ADD UNIQUE KEY uq_interventions_company_request (company_id, client_request_id)',
  'SELECT 1') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND INDEX_NAME = 'uq_interventions_company_request');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'client_request_id' AND TABLE_NAME IN ('rms_visits', 'interventions');

SELECT 'OK: 20261111_offline_client_request_id.sql' AS migration_done;

-- ---------------------------------------------------------------------------------------------
-- >>> 20261112_company_closure.sql
-- ---------------------------------------------------------------------------------------------
-- Company closure workflow (superadmin "request closure"): when it was requested, when the data may be purged (retention period,
-- default 30 days, see backend/utils/closure.js) and the subscription status before the closure (restored by "cancel closure").
-- Nothing is deleted by this migration or by the closure request; deletion is the manual script backend/scripts/purge-company.js.
-- Safe to re-run (information_schema + PREPARE). MySQL 8.4. Staging: staging-migrate AFTER the deploy of the commit finished;
-- production: Mario runs it after a backup. Without it the superadmin closure actions return 500 and the company detail shows no closure.
SET @c := (SELECT COUNT(1) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'closure_requested_at');
SET @ddl := IF(@c = 0, 'ALTER TABLE companies ADD COLUMN closure_requested_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(1) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'closure_purge_after');
SET @ddl := IF(@c = 0, 'ALTER TABLE companies ADD COLUMN closure_purge_after DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(1) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'closure_status_before');
SET @ddl := IF(@c = 0, 'ALTER TABLE companies ADD COLUMN closure_status_before VARCHAR(20) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME LIKE 'closure_%';

SELECT 'OK: 20261112_company_closure.sql' AS migration_done;

-- ---------------------------------------------------------------------------------------------
-- >>> 20261113_findings.sql
-- ---------------------------------------------------------------------------------------------
-- Findings module, step 1: every defect noticed on an elevator (RMS visit, intervention or manual entry) becomes a
-- tracked FINDING with a lifecycle until it is fixed.
--   findings        = the finding itself (INSERT-only, never updated or deleted)
--   finding_events  = its history (INSERT-only). The current state is DERIVED from the latest event that carries a
--                     state (open | waiting_part | in_progress | resolved); it is never stored on `findings`.
-- finding_events.intervention_id / work_order_id are nullable references reserved for step 2 (link to work orders / PDF).
-- location_id / elevator_id deliberately have no foreign key: locations and elevators can be deleted, the history stays
-- (elevator_label + location_name are snapshots). UNIQUE (company_id, client_request_id) = idempotent offline replays.
-- Safe to re-run (CREATE TABLE IF NOT EXISTS; indexes and keys are part of the table definition). MySQL 8.4.
-- Apply to staging with the staging-migrate workflow AFTER the deploy of the commit finished; production is run by
-- Mario after a backup. Without the migration the rest of the app keeps working (a request that carries findings is
-- then rejected with 503 findings_unavailable; nothing else is affected).

CREATE TABLE IF NOT EXISTS findings (
  id INT NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  location_id INT NOT NULL,
  location_name VARCHAR(255) NULL,
  elevator_id INT NULL,
  elevator_label VARCHAR(255) NOT NULL,
  source_type VARCHAR(20) NOT NULL,
  source_id INT NULL,
  description TEXT NOT NULL,
  category VARCHAR(30) NOT NULL DEFAULT 'other',
  severity VARCHAR(20) NOT NULL,
  needs_part TINYINT(1) NOT NULL DEFAULT 0,
  part_note VARCHAR(255) NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  client_request_id VARCHAR(64) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_findings_company_request (company_id, client_request_id),
  KEY idx_findings_company_created (company_id, created_at),
  KEY idx_findings_company_location (company_id, location_id),
  KEY idx_findings_company_elevator (company_id, elevator_id),
  CONSTRAINT fk_findings_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finding_events (
  id INT NOT NULL AUTO_INCREMENT,
  finding_id INT NOT NULL,
  company_id INT NOT NULL,
  event_type VARCHAR(20) NOT NULL,
  state VARCHAR(20) NULL,
  note TEXT NULL,
  user_id INT NULL,
  intervention_id INT NULL,
  work_order_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_finding_events_finding (finding_id, id),
  KEY idx_finding_events_company (company_id, created_at),
  CONSTRAINT fk_finding_events_finding FOREIGN KEY (finding_id) REFERENCES findings (id),
  CONSTRAINT fk_finding_events_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT TABLE_NAME, COUNT(*) AS columns_count FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('findings', 'finding_events') GROUP BY TABLE_NAME;

SELECT 'OK: 20261113_findings.sql' AS migration_done;

-- ---------------------------------------------------------------------------------------------
-- >>> 20261114_report_signature_completion.sql
-- ---------------------------------------------------------------------------------------------
-- Signature hardening + late client signing (RMS visits and interventions).
-- 1) New columns on rms_visits / interventions (nullable, no data rewrite): who signed for the technician and when, the client signer's
--    name + role and the time the client signed in the app. Historical signed rows keep working unchanged (columns stay NULL).
-- 2) signature_status gets a middle value: draft -> technician_signed (technician signed, client still to sign = content LOCKED)
--    -> signed (both signed in the app at once, the historical meaning). Which state a report is really in is derived in the
--    backend (utils/reportSignatures.js) from the row + report_completions.
-- 3) report_completions: INSERT-only record of how the CLIENT side was closed later (drawn signature in the app, scan of the signed
--    paper copy, or declined/absent with a reason). 4) report_snapshots: INSERT-only frozen PDF (file + sha256) and content hash
--    issued at technician signing / completion.
-- Safe to re-run (information_schema + PREPARE; no ADD COLUMN IF NOT EXISTS). MySQL 8.4.
-- Apply to staging with the staging-migrate workflow AFTER the deploy of the commit finished; production is run by Mario after a backup.
-- The signing endpoints need these columns/tables: run the migration right after the deploy.

-- rms_visits
SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rms_visits ADD COLUMN technician_signed_at DATETIME NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND COLUMN_NAME = 'technician_signed_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rms_visits ADD COLUMN technician_signed_by_user_id INT NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND COLUMN_NAME = 'technician_signed_by_user_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rms_visits ADD COLUMN technician_signer_name VARCHAR(150) NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND COLUMN_NAME = 'technician_signer_name');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rms_visits ADD COLUMN client_signer_name VARCHAR(150) NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND COLUMN_NAME = 'client_signer_name');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rms_visits ADD COLUMN client_signer_role VARCHAR(100) NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND COLUMN_NAME = 'client_signer_role');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rms_visits ADD COLUMN client_signed_at DATETIME NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND COLUMN_NAME = 'client_signed_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rms_visits MODIFY COLUMN signature_status ENUM(\'draft\',\'technician_signed\',\'signed\') DEFAULT \'draft\'',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND COLUMN_NAME = 'signature_status'
    AND COLUMN_TYPE LIKE '%technician_signed%');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- interventions
SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions ADD COLUMN technician_signed_at DATETIME NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND COLUMN_NAME = 'technician_signed_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions ADD COLUMN technician_signed_by_user_id INT NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND COLUMN_NAME = 'technician_signed_by_user_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions ADD COLUMN technician_signer_name VARCHAR(150) NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND COLUMN_NAME = 'technician_signer_name');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions ADD COLUMN client_signer_name VARCHAR(150) NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND COLUMN_NAME = 'client_signer_name');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions ADD COLUMN client_signer_role VARCHAR(100) NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND COLUMN_NAME = 'client_signer_role');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions ADD COLUMN client_signed_at DATETIME NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND COLUMN_NAME = 'client_signed_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions MODIFY COLUMN signature_status ENUM(\'draft\',\'technician_signed\',\'signed\') DEFAULT \'draft\'',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND COLUMN_NAME = 'signature_status'
    AND COLUMN_TYPE LIKE '%technician_signed%');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- report_completions: how the client side of a technician-signed report was closed LATER. INSERT-only, never edited.
--   method 'drawn'    client drew a signature in the app (signer_name + signer_role required by the API)
--   method 'scan'     a scan of the client-signed paper copy (PDF/JPG/PNG) was attached by the office/technician
--   method 'declined' client did not sign / was absent (reason in note); this is NOT a client signature
CREATE TABLE IF NOT EXISTS report_completions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  report_type ENUM('rms','intervention') NOT NULL,
  report_id INT NOT NULL,
  method ENUM('drawn','scan','declined') NOT NULL,
  signer_name VARCHAR(150) NULL,
  signer_role VARCHAR(100) NULL,
  signature_path VARCHAR(255) NULL,
  signature_sha256 CHAR(64) NULL,
  scan_path VARCHAR(255) NULL,
  scan_mime VARCHAR(50) NULL,
  scan_size INT UNSIGNED NULL,
  scan_sha256 CHAR(64) NULL,
  note VARCHAR(500) NULL,
  ip VARCHAR(100) NULL,
  created_by INT NULL,
  created_by_name VARCHAR(150) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_report_completions_report (company_id, report_type, report_id, created_at),
  CONSTRAINT fk_report_completions_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- report_snapshots: the frozen document that was issued. snapshot_no 1 = at technician signing (or at completion when both signed
-- at once), 2 = after the client side was completed later. INSERT-only; (company, type, report, snapshot_no) is UNIQUE so two
-- parallel requests cannot both write the same snapshot. pdf_sha256 = hash of the stored PDF file; document_hash = hash of the
-- canonical content (report + items + photos + signatures, see utils/reportSignatures.js, hash_version).
CREATE TABLE IF NOT EXISTS report_snapshots (
  id BIGINT NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  report_type ENUM('rms','intervention') NOT NULL,
  report_id INT NOT NULL,
  snapshot_no SMALLINT UNSIGNED NOT NULL,
  completion_id BIGINT NULL,
  document_number VARCHAR(64) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  pdf_sha256 CHAR(64) NOT NULL,
  document_hash CHAR(64) NOT NULL,
  hash_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  language VARCHAR(5) NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_report_snapshots_no (company_id, report_type, report_id, snapshot_no),
  CONSTRAINT fk_report_snapshots_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- interventions.created_by_user_id: who created the intervention (set on INSERT by the app). Lets the creator sign their own
-- intervention even if the technician NAME text differs; older rows stay NULL (the name match keeps working for them).
SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions ADD COLUMN created_by_user_id INT NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND COLUMN_NAME = 'created_by_user_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Index for the "waiting for client" lists (filter by company + status)
SET @sql = (SELECT IF(COUNT(*) = 0,
  'CREATE INDEX idx_rms_visits_company_sigstatus ON rms_visits (company_id, signature_status)',
  'SELECT 1') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND INDEX_NAME = 'idx_rms_visits_company_sigstatus');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'CREATE INDEX idx_interventions_company_sigstatus ON interventions (company_id, signature_status)',
  'SELECT 1') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND INDEX_NAME = 'idx_interventions_company_sigstatus');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN ('signature_status', 'technician_signed_at', 'client_signer_name')
  AND TABLE_NAME IN ('rms_visits', 'interventions');
SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('report_completions', 'report_snapshots');

SELECT 'OK: 20261114_report_signature_completion.sql' AS migration_done;

-- ---------------------------------------------------------------------------------------------
-- >>> 20261115_work_lines.sql
-- ---------------------------------------------------------------------------------------------
-- Work / material table ("Naziv radova / stavka, Kolicina, Jedinica mjere, Broj utrosenih sati") on interventions and work orders.
--   intervention_work_lines  = rows entered when the intervention is CREATED (INSERT-only, same transaction as the intervention;
--                              locked for good once the technician signs because the intervention itself is immutable).
--   work_order_work_lines    = rows of a work order (admin-edited while the order is OPEN: the whole row set is replaced in one
--                              transaction; read-only after the order is closed). Work orders are not part of the signature system.
--   report_snapshots.core_hash = hash of the signed content WITHOUT the two technician name columns, so that verification can tell
--                              "the technician was anonymised on request" from real tampering (verify status ok_anonymised).
-- (The older tables intervention_items / work_order_items hold per-elevator comments / the task checklist: unrelated.)
-- Safe to re-run (CREATE TABLE IF NOT EXISTS + information_schema/PREPARE). MySQL 8.4.
-- Apply to staging with the staging-migrate workflow AFTER the deploy of the commit finished; production is run by Mario after a backup.
-- Without the migration the app keeps working: requests without work lines are unaffected, a request that carries work lines
-- gets 503 work_lines_unavailable; verification simply has no core hash (falls back to the PDF-only check).

CREATE TABLE IF NOT EXISTS intervention_work_lines (
  id INT NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  intervention_id INT NOT NULL,
  position INT NOT NULL DEFAULT 1,
  name VARCHAR(200) NOT NULL,
  quantity DECIMAL(10,2) NULL,
  unit VARCHAR(20) NULL,
  hours DECIMAL(10,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_intervention_work_lines_parent (company_id, intervention_id, position),
  CONSTRAINT fk_intervention_work_lines_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS work_order_work_lines (
  id INT NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  work_order_id INT NOT NULL,
  position INT NOT NULL DEFAULT 1,
  name VARCHAR(200) NOT NULL,
  quantity DECIMAL(10,2) NULL,
  unit VARCHAR(20) NULL,
  hours DECIMAL(10,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_work_order_work_lines_parent (company_id, work_order_id, position),
  CONSTRAINT fk_work_order_work_lines_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE report_snapshots ADD COLUMN core_hash CHAR(64) NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_snapshots' AND COLUMN_NAME = 'core_hash');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('intervention_work_lines', 'work_order_work_lines');
SELECT COLUMN_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_snapshots' AND COLUMN_NAME = 'core_hash';

SELECT 'OK: 20261115_work_lines.sql' AS migration_done;

-- ===== PROVJERA NAKON MIGRACIJA =====
SELECT code, price_cents, admin_limit, technician_limit, trial_days FROM subscription_plans ORDER BY price_cents;
SELECT cs.company_id, sp.code, cs.status, cs.trial_ends_at, cs.admin_limit_override, cs.technician_limit_override FROM company_subscriptions cs JOIN subscription_plans sp ON sp.id = cs.plan_id;
