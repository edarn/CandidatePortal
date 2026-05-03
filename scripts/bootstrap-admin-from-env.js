import bcrypt from 'bcrypt';
import { pathToFileURL } from 'node:url';
import db from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { config } from '../src/config.js';

const findAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
const insertAdmin = db.prepare(
  "INSERT INTO users (email, password_hash, role, email_verified_at) VALUES (?, ?, 'admin', datetime('now'))",
);

export async function bootstrapAdminFromEnv() {
  if (!config.adminBootstrap) return;
  if (findAdmin.get()) return;

  const { email, password } = config.adminBootstrap;
  if (password.length < 10) {
    console.warn('ADMIN_BOOTSTRAP_PASSWORD too short (<10 chars) — skipping bootstrap.');
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
