UPDATE users
   SET role = 'student',
       updated_at = now()
 WHERE role IN ('teacher', 'parent');

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('student', 'admin'));
