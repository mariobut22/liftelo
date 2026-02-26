-- Add users.email if missing
SET @email_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'email'
);
SET @sql = IF(@email_exists = 0,
  'ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add users.email_notifications_enabled if missing
SET @email_notify_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'email_notifications_enabled'
);
SET @sql = IF(@email_notify_exists = 0,
  'ALTER TABLE users ADD COLUMN email_notifications_enabled BOOLEAN NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add companies.email_notifications_enabled if missing
SET @company_email_notify_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'companies'
    AND column_name = 'email_notifications_enabled'
);
SET @sql = IF(@company_email_notify_exists = 0,
  'ALTER TABLE companies ADD COLUMN email_notifications_enabled BOOLEAN NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
