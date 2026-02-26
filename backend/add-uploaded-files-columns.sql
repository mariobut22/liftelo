ALTER TABLE rms_records
  ADD COLUMN uploaded_files TEXT NULL;

ALTER TABLE interventions
  MODIFY COLUMN uploaded_files TEXT NULL;
