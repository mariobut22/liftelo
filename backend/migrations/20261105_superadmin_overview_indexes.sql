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
