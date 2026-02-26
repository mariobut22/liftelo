CREATE TABLE IF NOT EXISTS location_monthly_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  location_id INT NOT NULL,
  year INT NOT NULL,
  month INT NOT NULL,
  service_date DATE NULL,
  invoice_status ENUM('not_invoiced','invoiced') NOT NULL DEFAULT 'not_invoiced',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_location_year_month (company_id, location_id, year, month)
);
