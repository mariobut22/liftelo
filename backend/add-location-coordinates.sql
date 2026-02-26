-- Dodaj kolone za geografske koordinate u locations tablicu
ALTER TABLE locations 
ADD COLUMN latitude DECIMAL(10, 8) NULL AFTER address,
ADD COLUMN longitude DECIMAL(11, 8) NULL AFTER latitude;

-- Provjeri strukturu
DESCRIBE locations;
