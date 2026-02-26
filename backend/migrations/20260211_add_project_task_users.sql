CREATE TABLE IF NOT EXISTS project_task_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_task_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_project_task_user (project_task_id, user_id),
  INDEX idx_project_task_id (project_task_id),
  INDEX idx_user_id (user_id),
  CONSTRAINT fk_project_task_users_task
    FOREIGN KEY (project_task_id) REFERENCES project_tasks(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_project_task_users_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT
);
