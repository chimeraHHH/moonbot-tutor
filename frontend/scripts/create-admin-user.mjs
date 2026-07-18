import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const rawIdentifier = (process.env.ADMIN_IDENTIFIER || process.env.ADMIN_EMAIL || '').trim();
const password = process.env.ADMIN_PASSWORD || '';
const displayName = (process.env.ADMIN_NAME || '星燧管理员').trim();

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

if (!rawIdentifier || !password) {
  console.error('ADMIN_IDENTIFIER and ADMIN_PASSWORD are required');
  process.exit(1);
}
if (password.length < 8 || password.length > 128) {
  console.error('ADMIN_PASSWORD must contain 8-128 characters');
  process.exit(1);
}
if (!displayName || displayName.length > 40) {
  console.error('ADMIN_NAME must contain 1-40 characters');
  process.exit(1);
}

function normalizeIdentifier(value) {
  if (value.includes('@')) {
    const email = value.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
    return { value: email, email, phone: null };
  }

  let phone = value.replace(/[\s()-]/g, '');
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  if (/^1[3-9]\d{9}$/.test(phone)) phone = `+86${phone}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;
  return { value: phone, email: null, phone };
}

const identifier = normalizeIdentifier(rawIdentifier);
if (!identifier) {
  console.error('ADMIN_IDENTIFIER must be a valid phone number or email address');
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
  const existing = await pool.query(
    'SELECT id, role, status FROM users WHERE login_identifier = $1',
    [identifier.value],
  );
  if (existing.rowCount) {
    const user = existing.rows[0];
    if (user.role !== 'admin' || user.status !== 'active') {
      throw new Error(
        `ADMIN_IDENTIFIER ${identifier.value} already belongs to a non-active administrator`,
      );
    }
    console.log(`[admin] verified ${identifier.value}`);
  } else {
    await pool.query(
      `INSERT INTO users (
         id, login_identifier, email, phone, password_hash, display_name, role, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'admin', 'active')`,
      [
        randomUUID(),
        identifier.value,
        identifier.email,
        identifier.phone,
        hashPassword(password),
        displayName,
      ],
    );
    console.log(`[admin] created ${identifier.value}`);
  }
} finally {
  await pool.end();
}
