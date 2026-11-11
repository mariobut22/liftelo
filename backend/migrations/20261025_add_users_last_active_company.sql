-- Persist user workspace preference for multi-company continuity
-- Safe for repeated runs

SET @column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'last_active_company_id'
);

SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE users ADD COLUMN last_active_company_id INT NULL AFTER company_id',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill from current company_id where possible
UPDATE users u
LEFT JOIN companies c ON c.id = u.company_id
SET u.last_active_company_id = u.company_id
WHERE u.last_active_company_id IS NULL
  AND u.company_id IS NOT NULL
  AND c.id IS NOT NULL;

-- Verification
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME = 'last_active_company_id';
