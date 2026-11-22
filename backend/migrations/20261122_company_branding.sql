-- Company branding on PDFs: accent colour (hex "#RRGGBB", validated by the API). The logo uses the existing companies.logo_path
-- (migration 20260208_add_company_logo_path.sql; file in uploads/company-logos/<companyId>-...png|jpg). Presentation only: the
-- colour/logo are NOT part of any document content hash. Safe to re-run (information_schema + PREPARE). MySQL 8.4.
-- Staging: staging-migrate AFTER the deploy of the commit finished; production: Mario runs it after a backup.
-- Without it the Branding card cannot save a colour (PUT /api/company/branding -> 409) and PDFs keep the default look.
SET @c := (SELECT COUNT(1) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'logo_path');
SET @ddl := IF(@c = 0, 'ALTER TABLE companies ADD COLUMN logo_path VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(1) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'brand_accent_color');
SET @ddl := IF(@c = 0, 'ALTER TABLE companies ADD COLUMN brand_accent_color VARCHAR(7) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME IN ('logo_path', 'brand_accent_color');
