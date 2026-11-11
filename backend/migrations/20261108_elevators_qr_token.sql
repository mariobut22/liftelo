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
