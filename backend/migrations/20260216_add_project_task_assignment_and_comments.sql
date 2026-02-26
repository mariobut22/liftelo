CREATE TABLE IF NOT EXISTS project_task_users (
  task_id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY(task_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_task_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  company_id INT NOT NULL,
  user_id INT NOT NULL,
  comment TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_project_task_comments_task_id (task_id),
  INDEX idx_project_task_comments_company_id (company_id)
);

ALTER TABLE project_task_users
  CHANGE COLUMN project_task_id task_id INT NOT NULL;

ALTER TABLE project_task_comments
  CHANGE COLUMN project_task_id task_id INT NOT NULL;

ALTER TABLE project_task_comments
  ADD COLUMN company_id INT NULL;

UPDATE project_task_comments c
INNER JOIN project_tasks pt ON c.task_id = pt.id
INNER JOIN project_sections ps ON pt.project_section_id = ps.id
INNER JOIN projects p ON ps.project_id = p.id
SET c.company_id = p.company_id
WHERE c.company_id IS NULL;

ALTER TABLE project_task_comments
  MODIFY COLUMN company_id INT NOT NULL;
