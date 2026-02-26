-- Work Orders schema (append-only, company-scoped)
CREATE TABLE IF NOT EXISTS work_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  location_id INT NOT NULL,
  created_by_user_id INT NULL,
  status ENUM('open', 'completed', 'cancelled') NOT NULL DEFAULT 'open',
  due_date DATE NULL,
  general_comment TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP NULL,
  closed_by_user_id INT NULL,
  INDEX idx_work_orders_company (company_id),
  INDEX idx_work_orders_location (location_id),
  INDEX idx_work_orders_status (status)
);

CREATE TABLE IF NOT EXISTS work_order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  work_order_id INT NOT NULL,
  company_id INT NOT NULL,
  description TEXT NOT NULL,
  sort_order INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_work_order_items_company (company_id),
  INDEX idx_work_order_items_order (work_order_id)
);

CREATE TABLE IF NOT EXISTS work_order_elevators (
  id INT AUTO_INCREMENT PRIMARY KEY,
  work_order_id INT NOT NULL,
  company_id INT NOT NULL,
  elevator_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_work_order_elevators_company (company_id),
  INDEX idx_work_order_elevators_order (work_order_id),
  INDEX idx_work_order_elevators_elevator (elevator_id)
);

CREATE TABLE IF NOT EXISTS work_order_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  work_order_id INT NOT NULL,
  company_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_work_order_users_company (company_id),
  INDEX idx_work_order_users_order (work_order_id),
  INDEX idx_work_order_users_user (user_id)
);
