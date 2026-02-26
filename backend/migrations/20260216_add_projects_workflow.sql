-- Projects workflow alignment
UPDATE projects SET status = 'open' WHERE status = 'active';
UPDATE projects SET status = 'cancelled' WHERE status = 'archived';

ALTER TABLE projects
  MODIFY COLUMN status ENUM('open','in_progress','completed','cancelled') NOT NULL DEFAULT 'open',
  ADD COLUMN due_date DATE NULL;

CREATE TABLE IF NOT EXISTS project_users (
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY(project_id, user_id),
  CONSTRAINT fk_project_users_project
    FOREIGN KEY (project_id) REFERENCES projects(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_project_users_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);

ALTER TABLE project_sections
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0;

UPDATE project_sections
SET sort_order = order_index
WHERE sort_order = 0;

ALTER TABLE project_tasks
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0;

UPDATE project_tasks
SET sort_order = order_index
WHERE sort_order = 0;

CREATE TABLE IF NOT EXISTS project_activity (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  company_id INT NOT NULL,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  meta JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_project_activity_project_id (project_id),
  INDEX idx_project_activity_company_id (company_id),
  CONSTRAINT fk_project_activity_project
    FOREIGN KEY (project_id) REFERENCES projects(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_project_activity_company
    FOREIGN KEY (company_id) REFERENCES companies(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_project_activity_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);
