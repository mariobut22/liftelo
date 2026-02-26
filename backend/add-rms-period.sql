-- Dodaj kolonu rms_period u rms_records tablicu
ALTER TABLE rms_records 
ADD COLUMN rms_period VARCHAR(10) NULL AFTER date;

-- Provjeri strukturu
DESCRIBE rms_records;
