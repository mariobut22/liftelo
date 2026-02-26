-- Dodaj kolonu second_technician u rms_records tablicu
ALTER TABLE rms_records 
ADD COLUMN second_technician VARCHAR(100) NULL AFTER technician;

-- Provjeri strukturu tablice
DESCRIBE rms_records;
