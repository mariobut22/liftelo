-- Stripe billing MVP foundation
-- Safe for repeated runs

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255) NULL AFTER trial_days;

ALTER TABLE company_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255) NULL AFTER seats_override,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255) NULL AFTER stripe_customer_id;

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

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_plans'
    AND index_name = 'uq_subscription_plans_stripe_price_id'
);

SET @idx_sql := IF(
  @idx_exists = 0,
  'ALTER TABLE subscription_plans ADD UNIQUE KEY uq_subscription_plans_stripe_price_id (stripe_price_id)',
  'SELECT 1'
);

PREPARE stmt FROM @idx_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
