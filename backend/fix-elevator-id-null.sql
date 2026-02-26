-- Dozvoli NULL za elevator_id u rms_records tablici
ALTER TABLE rms_records 
MODIFY COLUMN elevator_id INT NULL;

-- Provjeri strukturu
DESCRIBE rms_records;
