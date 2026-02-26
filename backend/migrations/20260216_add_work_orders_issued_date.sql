-- Add issued_date if missing
SET @issued_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'work_orders'
    AND column_name = 'issued_date'
);
SET @sql = IF(@issued_exists = 0,
  'ALTER TABLE work_orders ADD COLUMN issued_date DATE NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
