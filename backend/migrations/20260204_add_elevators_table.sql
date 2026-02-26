CREATE TABLE IF NOT EXISTS elevators (
  id INT AUTO_INCREMENT PRIMARY KEY,
  location_id INT NOT NULL,
  label VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_elevators_location_label (location_id, label),
  INDEX idx_elevators_location (location_id)
);
