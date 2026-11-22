-- Read-only "building manager" page per location, reachable through a secret link (no login).
-- Only a SHA-256 hash of the token is stored (the token itself is shown once to the admin and never kept).
-- Rows are INSERT-only; a link is switched off by setting revoked_at (never deleted, never edited otherwise).
-- location_id deliberately has no foreign key (locations can be deleted; the public lookup joins locations and then returns 404).
-- Safe to re-run (CREATE TABLE IF NOT EXISTS, indexes are part of the definition). MySQL 8.4.
-- Apply to staging with the staging-migrate workflow AFTER the deploy of the commit finished; production is run by Mario after a backup.
-- Without this table the rest of the app keeps working (the share endpoints answer 503 share_unavailable / the public page 404).

CREATE TABLE IF NOT EXISTS location_share_links (
  id INT NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  location_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  revoked_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_share_links_token_hash (token_hash),
  KEY idx_share_links_company_location (company_id, location_id, revoked_at),
  CONSTRAINT fk_share_links_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT TABLE_NAME, COUNT(*) AS columns_count FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'location_share_links' GROUP BY TABLE_NAME;
