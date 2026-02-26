-- Schema changes: companies + nullable company_id columns
CREATE TABLE IF NOT EXISTS companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN company_id INT NULL;
ALTER TABLE locations ADD COLUMN company_id INT NULL;
ALTER TABLE elevators ADD COLUMN company_id INT NULL;
ALTER TABLE rms_visits ADD COLUMN company_id INT NULL;
ALTER TABLE rms_visit_items ADD COLUMN company_id INT NULL;
ALTER TABLE interventions ADD COLUMN company_id INT NULL;
ALTER TABLE intervention_items ADD COLUMN company_id INT NULL;
