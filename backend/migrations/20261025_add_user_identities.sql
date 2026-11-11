-- Identity provider foundation for Google/Apple login rollout
-- Safe for repeated runs

CREATE TABLE IF NOT EXISTS user_identities (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  provider ENUM('local', 'google', 'apple') NOT NULL,
  provider_sub VARCHAR(255) NULL,
  email_at_link_time VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_provider (user_id, provider),
  UNIQUE KEY uq_provider_sub (provider, provider_sub),
  CONSTRAINT fk_user_identities_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO user_identities (user_id, provider, provider_sub, email_at_link_time)
SELECT u.id, 'local', NULL, u.email
FROM users u
LEFT JOIN user_identities ui ON ui.user_id = u.id AND ui.provider = 'local'
WHERE ui.id IS NULL;

-- Verification
SELECT provider, COUNT(*) AS identities_count
FROM user_identities
GROUP BY provider
ORDER BY provider;
