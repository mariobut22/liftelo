-- Offline-tolerant entry: idempotent creates. The app sends a client_request_id (UUID) with every new RMS visit and
-- intervention and re-sends the SAME id when it retries after a lost connection; (company_id, client_request_id) is
-- UNIQUE, so a retry returns the stored record instead of inserting a duplicate. NULL ids (old clients) never collide.
-- Records stay append-only: only a nullable column + a unique index are added; nothing is updated or deleted.
-- Safe to re-run (information_schema + PREPARE; no ADD COLUMN IF NOT EXISTS). MySQL 8.4.
-- Apply to staging with the staging-migrate workflow AFTER the deploy of the commit finished; production is run by
-- Mario after a backup. Without the migration the app keeps working (the backend skips idempotency until the column exists).

-- rms_visits.client_request_id
SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rms_visits ADD COLUMN client_request_id VARCHAR(64) NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND COLUMN_NAME = 'client_request_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rms_visits ADD UNIQUE KEY uq_rms_visits_company_request (company_id, client_request_id)',
  'SELECT 1') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rms_visits' AND INDEX_NAME = 'uq_rms_visits_company_request');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- interventions.client_request_id
SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions ADD COLUMN client_request_id VARCHAR(64) NULL',
  'SELECT 1') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND COLUMN_NAME = 'client_request_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE interventions ADD UNIQUE KEY uq_interventions_company_request (company_id, client_request_id)',
  'SELECT 1') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'interventions' AND INDEX_NAME = 'uq_interventions_company_request');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'client_request_id' AND TABLE_NAME IN ('rms_visits', 'interventions');
