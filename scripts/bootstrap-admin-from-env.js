import bcrypt from 'bcrypt';
import { pathToFileURL } from 'node:url';
import db from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { config } from '../src/config.js';

export async function bootstrapAdminFromEnv() {
  if (!config.adminBootstrap) return;

  // Prepare statements lazily so this module is safe to import on a fresh
  // database where the users table doesn't exist yet — caller is expected
  // to have run migrations before invoking this function.
  const findAdmin = db.prepare(
    "SELECT id FROM users WHERE role = 'admin' LIMIT 1",
  );
  const insertAdmin = db.prepare(
    "INSERT INTO users (email, password_hash, role, email_verified_at) VALUES (?, ?, 'admin', datetime('now'))",
  );

  if (findAdmin.get()) return;

  const { email, password } = config.adminBootstrap;
  if (password.length < 10) {
    console.warn(
      'ADMIN_BOOTSTRAP_PASSWORD too short (<10 chars) — skipping bootstrap.',
    );
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  insertAdmin.run(email, hash);
  console.log(`Bootstrapped admin: ${email}`);
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runMigrations();
  await bootstrapAdminFromEnv();
}
