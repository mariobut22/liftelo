-- Data backfill: default company and assign existing rows
INSERT INTO companies (name)
SELECT 'Rijeka Dizalo'
WHERE NOT EXISTS (
  SELECT 1 FROM companies WHERE name = 'Rijeka Dizalo'
);

SET @default_company_id := (
  SELECT id FROM companies WHERE name = 'Rijeka Dizalo' LIMIT 1
);

UPDATE users SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE locations SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE elevators SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE rms_visits SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE rms_visit_items SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE interventions SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE intervention_items SET company_id = @default_company_id WHERE company_id IS NULL;
