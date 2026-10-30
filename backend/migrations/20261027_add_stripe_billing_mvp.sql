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
