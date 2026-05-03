import readline from 'node:readline/promises';
import bcrypt from 'bcrypt';
import db from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { emailSchema, passwordSchema } from '../src/lib/validation.js';

runMigrations();

const findAdmin = db.prepare("SELECT id, email FROM users WHERE role = 'admin' LIMIT 1");
const insertAdmin = db.prepare(
  "INSERT INTO users (email, password_hash, role, email_verified_at) VALUES (?, ?, 'admin', datetime('now'))",
);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

try {
  const existing = findAdmin.get();
  if (existing) {
    console.log(`An admin already exists: ${existing.email}`);
    console.log('To replace it, delete the existing admin row in the DB first.');
    process.exit(0);
  }

  const emailRaw = await rl.question('Admin email: ');
  const emailParse = emailSchema.safeParse(emailRaw.trim());
  if (!emailParse.success) {
    console.error('Invalid email.');
    process.exit(1);
  }
  const email = emailParse.data;

  const password = await rl.question('Admin password (min 10 chars, will display): ');
  const pwParse = passwordSchema.safeParse(password);
  if (!pwParse.success) {
    console.error('Password rejected:');
    for (const issue of pwParse.error.issues) {
      console.error(`  - ${issue.message}`);
    }
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  insertAdmin.run(email, hash);
  console.log(`Admin created: ${email}`);
} finally {
  rl.close();
}
