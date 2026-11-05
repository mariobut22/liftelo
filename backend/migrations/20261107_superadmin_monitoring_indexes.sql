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
