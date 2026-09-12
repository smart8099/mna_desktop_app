-- Fix: username lookups (login) and the UNIQUE constraint (account
-- creation) were case-sensitive, so logging in with different
-- capitalisation than the account was created with ("obed" vs "Obed")
-- always failed as "incorrect username or password" even with the right
-- password. Rebuild `users` with COLLATE NOCASE on username so both the
-- WHERE lookup and the uniqueness check are case-insensitive.

CREATE TABLE users_new (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  username           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash      TEXT NOT NULL,
  role               TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'teacher')),
  recovery_code_hash TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO users_new (id, username, password_hash, role, recovery_code_hash, created_at)
  SELECT id, username, password_hash, role, recovery_code_hash, created_at FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

UPDATE meta SET value = '6' WHERE key = 'schema_version';
