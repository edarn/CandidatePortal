import cron from 'node-cron';
import { createBackupFile, rotateBackups } from '../services/backup.js';
import { pushBackupToS3 } from '../services/backupS3.js';

export function registerDailyBackup() {
  cron.schedule(
    '0 3 * * *',
    async () => {
      try {
        console.log('[cron] Starting daily backup...');
        const filePath = await createBackupFile();
        console.log(`[cron] Backup written to ${filePath}`);
        try {
          const key = await pushBackupToS3(filePath);
          if (key) console.log(`[cron] Pushed to S3: ${key}`);
        } catch (err) {
          console.error('[cron] S3 push failed:', err);
        }
        rotateBackups(7);
      } catch (err) {
        console.error('[cron] Daily backup failed:', err);
      }
    },
    { timezone: 'Europe/Stockholm' },
  );
  console.log('Daily backup scheduled at 03:00 Europe/Stockholm');
}
