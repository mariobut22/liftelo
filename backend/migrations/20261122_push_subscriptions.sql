-- Web Push subscriptions (one row per browser/device of a user). A subscription belongs to exactly one user; subscribing again from
-- the same device (same endpoint) re-assigns the row to the current user/company (shared phone, logout/login). Rows are removed on
-- unsubscribe and automatically when the push service answers 404/410 (expired). endpoint_hash = sha256(endpoint) is the unique key
-- (endpoints can be long). Safe to re-run (CREATE TABLE IF NOT EXISTS). MySQL 8.4.
-- Staging: staging-migrate AFTER the deploy of the commit finished; production: Mario runs it after a backup.
-- Without it push is simply unavailable (the endpoints answer 409 push_not_available; notifications are unaffected).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  user_id INT NOT NULL,
  endpoint TEXT NOT NULL,
  endpoint_hash CHAR(64) NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_push_subscriptions_endpoint (endpoint_hash),
  KEY idx_push_subscriptions_user (user_id),
  KEY idx_push_subscriptions_company (company_id),
  CONSTRAINT fk_push_subscriptions_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_push_subscriptions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT TABLE_NAME, TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'push_subscriptions';
