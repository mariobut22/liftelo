CREATE TABLE vehicles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  image_path VARCHAR(255) NULL,
  year INT NOT NULL,
  last_registration_date DATE NOT NULL,
  registration_expiry_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vehicles_company_id (company_id),
  CONSTRAINT fk_vehicles_company
    FOREIGN KEY (company_id) REFERENCES companies(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);
