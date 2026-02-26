-- Dodaj kolonu document_name u rms_records i interventions tablice
ALTER TABLE rms_records 
ADD COLUMN document_name VARCHAR(255) NULL AFTER rms_period;

ALTER TABLE interventions 
ADD COLUMN document_name VARCHAR(255) NULL AFTER pdf_path;

-- Provjeri strukture
DESCRIBE rms_records;
DESCRIBE interventions;
