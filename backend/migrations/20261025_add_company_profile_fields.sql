-- Add optional company profile fields used by dashboard/settings
-- Safe for repeated runs

SET @address_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'address'
);

SET @ddl := IF(
  @address_exists = 0,
  'ALTER TABLE companies ADD COLUMN address VARCHAR(255) NULL AFTER logo_path',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @contact_person_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'contact_person'
);

SET @ddl := IF(
  @contact_person_exists = 0,
  'ALTER TABLE companies ADD COLUMN contact_person VARCHAR(255) NULL AFTER address',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @contact_phone_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'contact_phone'
);

SET @ddl := IF(
  @contact_phone_exists = 0,
  'ALTER TABLE companies ADD COLUMN contact_phone VARCHAR(100) NULL AFTER contact_person',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @oib_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'oib'
);

SET @ddl := IF(
  @oib_exists = 0,
  'ALTER TABLE companies ADD COLUMN oib VARCHAR(32) NULL AFTER contact_phone',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @notes_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'notes'
);

SET @ddl := IF(
  @notes_exists = 0,
  'ALTER TABLE companies ADD COLUMN notes TEXT NULL AFTER oib',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verification
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'companies'
  AND COLUMN_NAME IN ('address', 'contact_person', 'contact_phone', 'oib', 'notes')
ORDER BY FIELD(COLUMN_NAME, 'address', 'contact_person', 'contact_phone', 'oib', 'notes');
