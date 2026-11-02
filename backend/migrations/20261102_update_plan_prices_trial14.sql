-- Decision 2026-11-02: new prices (EUR, monthly) and 14-day trial.
-- Starter 79 EUR, Pro 179 EUR, Corporate 399 EUR. Limits are unchanged.
-- Safe to re-run. Run AFTER 20261102_update_subscription_plans_role_limits.sql
-- (re-running that older file would reset prices to 29/59/119 and trial to 7 days).
-- Existing company trials (trial_ends_at) are NOT changed; stripe_price_id is not touched.

UPDATE subscription_plans SET price_cents = 7900,  trial_days = 14 WHERE code = 'starter';
UPDATE subscription_plans SET price_cents = 17900, trial_days = 14 WHERE code = 'pro';
UPDATE subscription_plans SET price_cents = 39900, trial_days = 14 WHERE code = 'corporate';

-- Resulting state (read-only, shown in the run log)
SELECT id, code, name, price_cents, admin_limit, technician_limit, trial_days, stripe_price_id, is_active
FROM subscription_plans ORDER BY price_cents;
