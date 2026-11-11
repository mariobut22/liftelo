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
