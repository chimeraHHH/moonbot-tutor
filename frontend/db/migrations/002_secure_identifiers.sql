ALTER TABLE users ADD COLUMN login_identifier TEXT;
ALTER TABLE users ADD COLUMN phone TEXT;

UPDATE users
   SET email = lower(trim(email)),
       login_identifier = lower(trim(email));

ALTER TABLE users ALTER COLUMN login_identifier SET NOT NULL;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

CREATE UNIQUE INDEX users_login_identifier_unique_idx ON users(login_identifier);
CREATE UNIQUE INDEX users_phone_unique_idx ON users(phone) WHERE phone IS NOT NULL;

ALTER TABLE users
  ADD CONSTRAINT users_single_login_identifier_check
  CHECK (
    (email IS NOT NULL AND phone IS NULL AND login_identifier = email)
    OR
    (email IS NULL AND phone IS NOT NULL AND login_identifier = phone)
  );

ALTER TABLE login_attempts RENAME TO auth_attempts;
ALTER TABLE auth_attempts RENAME COLUMN email TO identifier;
ALTER TABLE auth_attempts ADD COLUMN kind TEXT NOT NULL DEFAULT 'login';
ALTER TABLE auth_attempts
  ADD CONSTRAINT auth_attempts_kind_check CHECK (kind IN ('login', 'register'));

CREATE INDEX auth_attempts_kind_identifier_created_at_idx
  ON auth_attempts(kind, identifier, created_at DESC);
CREATE INDEX auth_attempts_kind_ip_created_at_idx
  ON auth_attempts(kind, ip_address, created_at DESC);
CREATE INDEX auth_attempts_kind_created_at_idx
  ON auth_attempts(kind, created_at DESC);
