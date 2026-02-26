CREATE TABLE email_outbox (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  to_email VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  html LONGTEXT NOT NULL,
  status ENUM('pending','sending','sent','failed') DEFAULT 'pending',
  attempts INT DEFAULT 0,
  next_attempt_at DATETIME DEFAULT NOW(),
  locked_at DATETIME NULL,
  locked_by VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  INDEX(status),
  INDEX(next_attempt_at)
);
