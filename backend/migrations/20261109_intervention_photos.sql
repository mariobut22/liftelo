-- Intervention photos (photo pipeline): one INSERT-only row per photo with caption, before/after tag, size, dimensions.
-- New table only; interventions.uploaded_files (comma separated, legacy photos) is left untouched and still shown.
-- Safe to re-run (CREATE TABLE IF NOT EXISTS). MySQL 8.4. Apply to staging with the staging-migrate workflow AFTER the deploy of
-- the commit finished; production is run by Mario after a backup.
CREATE TABLE IF NOT EXISTS intervention_photos (
  id BIGINT NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  intervention_id INT NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  mime VARCHAR(50) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  width SMALLINT UNSIGNED NULL,
  height SMALLINT UNSIGNED NULL,
  kind ENUM('before','after','other') NOT NULL DEFAULT 'other',
  caption VARCHAR(255) NULL,
  taken_at DATETIME NULL,
  client_request_id VARCHAR(64) NULL,
  uploaded_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_intervention_photos_company_intervention (company_id, intervention_id, created_at),
  UNIQUE KEY uq_intervention_photos_request (company_id, intervention_id, client_request_id),
  CONSTRAINT fk_intervention_photos_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_intervention_photos_intervention FOREIGN KEY (intervention_id) REFERENCES interventions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT TABLE_NAME, TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'intervention_photos';
