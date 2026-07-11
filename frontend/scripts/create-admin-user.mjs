import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';
const displayName = (process.env.ADMIN_NAME || 'Sophos Admin').trim();

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

if (!email || !password) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
  process.exit(1);
}

function hashPassword(value) {
  const salt = randomBytes(16).toString('base64url');
  const n = 16384;
  const r = 8;
  const p = 1;
  const key = scryptSync(value, salt, 64, { N: n, r, p });
  return `scrypt$${n}$${r}$${p}$${salt}$${key.toString('base64url')}`;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount) {
    await pool.query(
      `UPDATE users
          SET password_hash = $1,
              display_name = $2,
              role = 'admin',
              status = 'active',
              updated_at = now()
        WHERE email = $3`,
      [hashPassword(password), displayName, email],
    );
    console.log(`[admin] updated ${email}`);
  } else {
    await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name, role, status)
       VALUES ($1, $2, $3, $4, 'admin', 'active')`,
      [randomUUID(), email, hashPassword(password), displayName],
    );
    console.log(`[admin] created ${email}`);
  }
} finally {
  await pool.end();
}
