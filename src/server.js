import { runMigrations } from './db/migrate.js';
import { config } from './config.js';

// Migrations must run *before* any module that prepares SQL statements
// is imported. better-sqlite3 validates table existence at prepare time,
// so importing routes/middleware on a fresh DB would otherwise throw
// "no such table". Hence the dynamic imports below.
runMigrations();

const { bootstrapAdminFromEnv } = await import(
  '../scripts/bootstrap-admin-from-env.js'
);
await bootstrapAdminFromEnv();

if (process.env.SEED_DEMO === '1') {
  const { seedDemo } = await import('../scripts/seed-demo.js');
  await seedDemo();
}

const { createApp } = await import('./app.js');
const app = createApp();

if (config.isProd) {
  const { registerDailyBackup } = await import('./jobs/dailyBackup.js');
  const { registerInactivityCleanup } = await import(
    './jobs/inactivityCleanup.js'
  );
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
