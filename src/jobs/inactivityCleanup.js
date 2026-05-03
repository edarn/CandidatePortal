import cron from 'node-cron';
import path from 'node:path';
import fs from 'node:fs';
import db from '../db/connection.js';
import { sendMail } from '../services/email.js';
import { config } from '../config.js';

const WARN_AFTER_DAYS = 365 - 14;
const DELETE_AFTER_WARN_DAYS = 14;

const findToWarn = db.prepare(`
  SELECT u.id, u.email, c.full_name, c.preferred_locale
  FROM users u JOIN candidates c ON c.user_id = u.id
  WHERE u.role = 'candidate'
    AND c.inactivity_warned_at IS NULL
    AND c.updated_at < datetime('now', ?)
`);

const markWarned = db.prepare(
  "UPDATE candidates SET inactivity_warned_at = datetime('now') WHERE user_id = ?",
);

const findToDelete = db.prepare(`
  SELECT u.id, c.cv_filename
  FROM users u JOIN candidates c ON c.user_id = u.id
  WHERE u.role = 'candidate'
    AND c.inactivity_warned_at IS NOT NULL
    AND c.inactivity_warned_at < datetime('now', ?)
`);

const deleteUser = db.prepare('DELETE FROM users WHERE id = ?');
const insertDeletionLog = db.prepare(
  "INSERT INTO deletion_log (user_id, reason) VALUES (?, 'inactivity')",
);

export function registerInactivityCleanup() {
  cron.schedule(
    '0 4 * * *',
    async () => {
      try {
        const toWarn = findToWarn.all(`-${WARN_AFTER_DAYS} days`);
        for (const c of toWarn) {
          try {
            await sendMail({
              to: c.email,
              locale: c.preferred_locale || 'sv',
              template: 'inactivity-warning',
              vars: {
                name: c.full_name,
                days: DELETE_AFTER_WARN_DAYS,
                loginUrl: `${config.baseUrl}/login`,
              },
            });
            markWarned.run(c.id);
          } catch (err) {
            console.error('[cron] Failed to warn', c.email, err);
          }
        }

        const toDelete = findToDelete.all(`-${DELETE_AFTER_WARN_DAYS} days`);
        for (const u of toDelete) {
          const tx = db.transaction(() => {
            deleteUser.run(u.id);
            insertDeletionLog.run(u.id);
          });
          tx();
          if (u.cv_filename) {
            fs.unlink(path.join(config.uploadsDir, u.cv_filename), () => {});
          }
        }

        if (toWarn.length || toDelete.length) {
          console.log(
            `[cron] Inactivity: warned ${toWarn.length}, deleted ${toDelete.length}`,
          );
        }
      } catch (err) {
        console.error('[cron] Inactivity cleanup failed:', err);
      }
    },
    { timezone: 'Europe/Stockholm' },
  );
  console.log('Inactivity cleanup scheduled at 04:00 Europe/Stockholm');
}
