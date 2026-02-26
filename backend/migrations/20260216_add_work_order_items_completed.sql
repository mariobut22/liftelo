-- Add is_completed if missing
SET @item_completed_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'work_order_items'
    AND column_name = 'is_completed'
);
SET @sql = IF(@item_completed_exists = 0,
  'ALTER TABLE work_order_items ADD COLUMN is_completed TINYINT(1) DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
