-- READ-ONLY: lists companies and their subscriptions (no changes). Staging diagnostics.
SELECT c.id, c.name, sp.code AS plan, cs.status, cs.trial_ends_at, cs.current_period_end
FROM companies c
LEFT JOIN company_subscriptions cs ON cs.company_id = c.id
LEFT JOIN subscription_plans sp ON sp.id = cs.plan_id
ORDER BY c.id;
