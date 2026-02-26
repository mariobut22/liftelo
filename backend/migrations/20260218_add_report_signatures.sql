ALTER TABLE rms_visits
  ADD COLUMN technician_signature_path VARCHAR(255) NULL,
  ADD COLUMN client_signature_path VARCHAR(255) NULL,
  ADD COLUMN signed_by_user_id INT NULL,
  ADD COLUMN signed_at DATETIME NULL,
  ADD COLUMN signature_ip VARCHAR(100) NULL,
  ADD COLUMN signature_status ENUM('draft', 'signed') DEFAULT 'draft',
  ADD COLUMN document_hash VARCHAR(255) NULL;

ALTER TABLE interventions
  ADD COLUMN technician_signature_path VARCHAR(255) NULL,
  ADD COLUMN client_signature_path VARCHAR(255) NULL,
  ADD COLUMN signed_by_user_id INT NULL,
  ADD COLUMN signed_at DATETIME NULL,
  ADD COLUMN signature_ip VARCHAR(100) NULL,
  ADD COLUMN signature_status ENUM('draft', 'signed') DEFAULT 'draft',
  ADD COLUMN document_hash VARCHAR(255) NULL;
