import { runMigrations } from './db/migrate.js';
import { bootstrapAdminFromEnv } from '../scripts/bootstrap-admin-from-env.js';
import { createApp } from './app.js';
import { config } from './config.js';
import { registerDailyBackup } from './jobs/dailyBackup.js';
import { registerInactivityCleanup } from './jobs/inactivityCleanup.js';

runMigrations();
await bootstrapAdminFromEnv();

const app = createApp();

if (config.isProd) {
  registerDailyBackup();
  registerInactivityCleanup();
} else {
  console.log('(dev mode: cron jobs are disabled)');
}

app.listen(config.port, () => {
  console.log(
    `CandidatePortal listening on http://localhost:${config.port} (env=${config.env})`,
  );
});
