-- RMS VISITS
ALTER TABLE rms_visits
  ADD COLUMN IF NOT EXISTS technician_signature_path VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS client_signature_path VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS signed_by_user_id INT NULL,
  ADD COLUMN IF NOT EXISTS signed_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS signature_ip VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS signature_status ENUM('draft','signed') DEFAULT 'draft';

-- INTERVENTIONS
ALTER TABLE interventions
  ADD COLUMN IF NOT EXISTS technician_signature_path VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS client_signature_path VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS signed_by_user_id INT NULL,
  ADD COLUMN IF NOT EXISTS signed_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS signature_ip VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS signature_status ENUM('draft','signed') DEFAULT 'draft';
