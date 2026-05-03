import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import db from './connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

export function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db.prepare('SELECT filename FROM _migrations').all().map((r) => r.filename),
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const insert = db.prepare('INSERT INTO _migrations (filename) VALUES (?)');

  let ranAny = false;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Running migration: ${file}`);
    const run = db.transaction(() => {
      db.exec(sql);
      insert.run(file);
    });
    run();
    ranAny = true;
  }

  if (!ranAny) {
    console.log('No new migrations to run.');
  } else {
    console.log('Migrations complete.');
  }
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runMigrations();
}
