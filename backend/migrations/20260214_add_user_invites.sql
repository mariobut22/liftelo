ALTER TABLE users
  ADD COLUMN invite_token VARCHAR(255) NULL,
  ADD COLUMN invite_expires DATETIME NULL,
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 0;

UPDATE users SET is_active = 1 WHERE is_active = 0;
