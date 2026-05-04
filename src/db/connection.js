import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const dbPath = config.databasePath;
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Safety: a previous deploy with a misconfigured BRANDING_DIR or UPLOADS_DIR
// pointing at this path would have auto-created it as a directory. If the
// directory is empty we silently remove it so the DB file can be created.
// If it's non-empty we refuse to start with a clear message.
if (fs.existsSync(dbPath) && fs.statSync(dbPath).isDirectory()) {
  const contents = fs.readdirSync(dbPath);
  if (contents.length === 0) {
    console.warn(
      `[db] Removing stale empty directory at DATABASE_PATH "${dbPath}" before opening DB.`,
    );
    fs.rmdirSync(dbPath);
  } else {
    const backupName = `${dbPath}.broken-${Date.now()}`;
    console.warn(
      `[db] Stale non-empty directory at DATABASE_PATH "${dbPath}". ` +
        `Moving to "${backupName}" so the DB file can be created.`,
    );
    fs.renameSync(dbPath, backupName);
  }
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

export default db;
