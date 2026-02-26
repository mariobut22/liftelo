CREATE TABLE IF NOT EXISTS rms_visits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  location_id INT NOT NULL,
  user_id INT NULL,
  visit_date DATETIME NOT NULL,
  notes_general TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rms_visits_location (location_id)
);

CREATE TABLE IF NOT EXISTS rms_visit_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  visit_id INT NOT NULL,
  elevator_label VARCHAR(10) NOT NULL,
  status VARCHAR(100) NOT NULL,
  comment TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rms_visit_items_visit (visit_id),
  INDEX idx_rms_visit_items_visit_label (visit_id, elevator_label),
  UNIQUE KEY uniq_rms_visit_item (visit_id, elevator_label)
);
