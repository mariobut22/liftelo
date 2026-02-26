-- Add soft-disable column for users (if missing)
SET @has_disabled_at := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'disabled_at'
);

SET @sql := IF(
  @has_disabled_at > 0,
  'SELECT "users.disabled_at already exists"',
  'ALTER TABLE users ADD COLUMN disabled_at TIMESTAMP NULL'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
