-- Add user language preference
ALTER TABLE users
  ADD COLUMN language VARCHAR(5) NULL;

-- Optional validation query
SELECT id, email, language FROM users LIMIT 5;
