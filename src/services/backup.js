import archiver from 'archiver';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import db from '../db/connection.js';

function buildArchive(outputStream) {
  return new Promise((resolve, reject) => {
    const tmpDb = path.join(config.backupsDir, `_tmp_${Date.now()}.sqlite`);
    fs.mkdirSync(path.dirname(tmpDb), { recursive: true });

    const cleanup = () => {
      fs.promises.unlink(tmpDb).catch(() => {});
    };

    db.backup(tmpDb)
      .then(() => {
        const archive = archiver('zip', { zlib: { level: 9 } });
        let settled = false;
        const settle = (fn, arg) => {
          if (settled) return;
          settled = true;
          cleanup();
          fn(arg);
        };

        archive.on('error', (err) => settle(reject, err));
        archive.on('warning', (err) => {
          if (err.code !== 'ENOENT') console.warn('archiver warning:', err);
        });
        outputStream.on('error', (err) => settle(reject, err));
        outputStream.on('close', () => settle(resolve));
        outputStream.on('finish', () => settle(resolve));

        archive.pipe(outputStream);
        archive.file(tmpDb, { name: 'database.sqlite' });
        if (fs.existsSync(config.uploadsDir)) {
          archive.directory(config.uploadsDir, 'uploads');
        }
        if (fs.existsSync(config.brandingDir)) {
          archive.directory(config.brandingDir, 'branding');
        }
        archive.finalize();
      })
      .catch((err) => {
        cleanup();
        reject(err);
      });
  });
}

export async function streamBackupTo(outputStream) {
  return buildArchive(outputStream);
}

export async function createBackupFile() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filePath = path.join(config.backupsDir, `backup-${stamp}.zip`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const out = fs.createWriteStream(filePath);
  await buildArchive(out);
  return filePath;
}

export function rotateBackups(maxKeep = 7) {
  if (!fs.existsSync(config.backupsDir)) return;
  const files = fs
    .readdirSync(config.backupsDir)
    .filter((f) => f.startsWith('backup-') && f.endsWith('.zip'))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(config.backupsDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const file of files.slice(maxKeep)) {
    fs.unlinkSync(path.join(config.backupsDir, file.name));
  }
}
