-- Pre-checks: orphaned company_id rows (must be zero before adding FKs)
SELECT 'users' AS table_name, COUNT(*) AS missing_company_id
FROM users
WHERE company_id IS NULL;

SELECT 'locations' AS table_name, COUNT(*) AS missing_company_id
FROM locations
WHERE company_id IS NULL;

SELECT 'elevators' AS table_name, COUNT(*) AS missing_company_id
FROM elevators
WHERE company_id IS NULL;

SELECT 'rms_visits' AS table_name, COUNT(*) AS missing_company_id
FROM rms_visits
WHERE company_id IS NULL;

SELECT 'rms_visit_items' AS table_name, COUNT(*) AS missing_company_id
FROM rms_visit_items
WHERE company_id IS NULL;

SELECT 'interventions' AS table_name, COUNT(*) AS missing_company_id
FROM interventions
WHERE company_id IS NULL;

SELECT 'intervention_items' AS table_name, COUNT(*) AS missing_company_id
FROM intervention_items
WHERE company_id IS NULL;

-- Pre-checks: orphaned company_id rows (must be zero before adding FKs)
SELECT 'users' AS table_name, COUNT(*) AS missing_company
FROM users u LEFT JOIN companies c ON u.company_id = c.id
WHERE u.company_id IS NOT NULL AND c.id IS NULL;

SELECT 'locations' AS table_name, COUNT(*) AS missing_company
FROM locations l LEFT JOIN companies c ON l.company_id = c.id
WHERE l.company_id IS NOT NULL AND c.id IS NULL;

SELECT 'elevators' AS table_name, COUNT(*) AS missing_company
FROM elevators e LEFT JOIN companies c ON e.company_id = c.id
WHERE e.company_id IS NOT NULL AND c.id IS NULL;

SELECT 'rms_visits' AS table_name, COUNT(*) AS missing_company
FROM rms_visits v LEFT JOIN companies c ON v.company_id = c.id
WHERE v.company_id IS NOT NULL AND c.id IS NULL;

SELECT 'rms_visit_items' AS table_name, COUNT(*) AS missing_company
FROM rms_visit_items i LEFT JOIN companies c ON i.company_id = c.id
WHERE i.company_id IS NOT NULL AND c.id IS NULL;

SELECT 'interventions' AS table_name, COUNT(*) AS missing_company
FROM interventions i LEFT JOIN companies c ON i.company_id = c.id
WHERE i.company_id IS NOT NULL AND c.id IS NULL;

SELECT 'intervention_items' AS table_name, COUNT(*) AS missing_company
FROM intervention_items ii LEFT JOIN companies c ON ii.company_id = c.id
WHERE ii.company_id IS NOT NULL AND c.id IS NULL;

-- Enforce NOT NULL
ALTER TABLE users MODIFY company_id INT NOT NULL;
ALTER TABLE locations MODIFY company_id INT NOT NULL;
ALTER TABLE elevators MODIFY company_id INT NOT NULL;
ALTER TABLE rms_visits MODIFY company_id INT NOT NULL;
ALTER TABLE rms_visit_items MODIFY company_id INT NOT NULL;
ALTER TABLE interventions MODIFY company_id INT NOT NULL;
ALTER TABLE intervention_items MODIFY company_id INT NOT NULL;

-- Indexes for company_id
ALTER TABLE users ADD INDEX idx_users_company_id (company_id);
ALTER TABLE locations ADD INDEX idx_locations_company_id (company_id);
ALTER TABLE elevators ADD INDEX idx_elevators_company_id (company_id);
ALTER TABLE rms_visits ADD INDEX idx_rms_visits_company_id (company_id);
ALTER TABLE rms_visit_items ADD INDEX idx_rms_visit_items_company_id (company_id);
ALTER TABLE interventions ADD INDEX idx_interventions_company_id (company_id);
ALTER TABLE intervention_items ADD INDEX idx_intervention_items_company_id (company_id);

-- Foreign keys to companies(id)
ALTER TABLE users
  ADD CONSTRAINT fk_users_company
  FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE locations
  ADD CONSTRAINT fk_locations_company
  FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE elevators
  ADD CONSTRAINT fk_elevators_company
  FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE rms_visits
  ADD CONSTRAINT fk_rms_visits_company
  FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE rms_visit_items
  ADD CONSTRAINT fk_rms_visit_items_company
  FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE interventions
  ADD CONSTRAINT fk_interventions_company
  FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE intervention_items
  ADD CONSTRAINT fk_intervention_items_company
  FOREIGN KEY (company_id) REFERENCES companies(id);

-- Unique constraint for users within a company (if email exists)
SET @has_email := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'email'
);
SET @sql := IF(
  @has_email > 0,
  'ALTER TABLE users ADD UNIQUE KEY uniq_users_company_email (company_id, email)',
  'SELECT "users.email column not found; skipping unique constraint"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
