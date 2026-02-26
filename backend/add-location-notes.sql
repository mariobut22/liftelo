-- Dodaj kolonu notes u locations tablicu
ALTER TABLE locations 
ADD COLUMN notes TEXT NULL;

-- Provjeri strukturu
DESCRIBE locations;
