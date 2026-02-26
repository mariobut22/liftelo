CREATE TABLE projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  location_id INT NULL,
  status ENUM('active', 'completed', 'archived') NOT NULL DEFAULT 'active',
  start_date DATE NULL,
  expected_end_date DATE NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_projects_company_id (company_id),
  CONSTRAINT fk_projects_company
    FOREIGN KEY (company_id) REFERENCES companies(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_projects_location
    FOREIGN KEY (location_id) REFERENCES locations(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT fk_projects_created_by
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);

CREATE TABLE project_sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  INDEX idx_project_sections_project_id (project_id),
  CONSTRAINT fk_project_sections_project
    FOREIGN KEY (project_id) REFERENCES projects(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE TABLE project_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_section_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  assigned_user_id INT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMP NULL,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_project_tasks_section_id (project_section_id),
  CONSTRAINT fk_project_tasks_section
    FOREIGN KEY (project_section_id) REFERENCES project_sections(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_project_tasks_assigned_user
    FOREIGN KEY (assigned_user_id) REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

CREATE TABLE project_task_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_task_id INT NOT NULL,
  user_id INT NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_project_task_comments_task_id (project_task_id),
  CONSTRAINT fk_project_task_comments_task
    FOREIGN KEY (project_task_id) REFERENCES project_tasks(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_project_task_comments_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);
