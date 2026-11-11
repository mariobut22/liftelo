-- Add user language preference (users.language VARCHAR(5) NULL)
-- Safe for repeated runs on MySQL 8.4 (information_schema check, no ADD COLUMN IF NOT EXISTS)
SET @col_exists := (
  SELECT COUNT(1) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'language'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN language VARCHAR(5) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Optional validation query
SELECT id, email, language FROM users LIMIT 5;
