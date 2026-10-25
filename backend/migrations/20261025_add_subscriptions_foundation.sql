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
