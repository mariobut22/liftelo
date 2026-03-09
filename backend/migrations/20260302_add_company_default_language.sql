-- Add companies.default_language with default 'hr' (idempotent)
-- Safe for repeated runs

SET @column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'default_language'
);

SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE companies ADD COLUMN default_language VARCHAR(5) NOT NULL DEFAULT ''hr''',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verification
-- 1) Column exists
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'companies'
  AND COLUMN_NAME = 'default_language';

-- 2) Sample values
SELECT id, name, default_language FROM companies ORDER BY id ASC LIMIT 10;
