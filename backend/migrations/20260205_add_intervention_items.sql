CREATE TABLE IF NOT EXISTS intervention_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  intervention_id INT NOT NULL,
  elevator_label VARCHAR(255) NOT NULL,
  comment TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_intervention_items_intervention (intervention_id),
  INDEX idx_intervention_items_label (intervention_id, elevator_label),
  UNIQUE KEY uniq_intervention_item (intervention_id, elevator_label)
);
