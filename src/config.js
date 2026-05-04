import { z } from 'zod';
import path from 'node:path';

const optionalString = z.string().optional().or(z.literal('').transform(() => undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  BASE_URL: z.string().url().default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),

  DATABASE_PATH: z.string().default('./data/database.sqlite'),
  UPLOADS_DIR: z.string().default('./data/uploads'),
  BRANDING_DIR: z.string().default('./data/branding'),
  BACKUPS_DIR: z.string().default('./data/backups'),

  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,

  ADMIN_BOOTSTRAP_EMAIL: optionalString,
  ADMIN_BOOTSTRAP_PASSWORD: optionalString,

  BACKUP_S3_ENDPOINT: optionalString,
  BACKUP_S3_BUCKET: optionalString,
  BACKUP_S3_KEY: optionalString,
  BACKUP_S3_SECRET: optionalString,
  BACKUP_S3_REGION: optionalString,
});

const rawEnv = { ...process.env };
// Derive BASE_URL from Railway's public domain when not explicitly set.
if (!rawEnv.BASE_URL && rawEnv.RAILWAY_PUBLIC_DOMAIN) {
  rawEnv.BASE_URL = `https://${rawEnv.RAILWAY_PUBLIC_DOMAIN}`;
}
// Auto-prepend https:// if a scheme is missing.
if (rawEnv.BASE_URL && !/^https?:\/\//i.test(rawEnv.BASE_URL)) {
  rawEnv.BASE_URL = `https://${rawEnv.BASE_URL}`;
}

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  const issues = parsed.error.flatten().fieldErrors;
  console.error('Invalid environment configuration:');
  for (const [key, errs] of Object.entries(issues)) {
    console.error(`  ${key}: ${errs.join(', ')}`);
  }
  console.error('\nCopy .env.example to .env and fill in the required values.');
  process.exit(1);
}

const env = parsed.data;

const emailReady = Boolean(env.RESEND_API_KEY);

export const config = {
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  isDev: env.NODE_ENV === 'development',
  isTest: env.NODE_ENV === 'test',

  port: env.PORT,
  baseUrl: env.BASE_URL.replace(/\/$/, ''),
  sessionSecret: env.SESSION_SECRET,

  databasePath: path.resolve(env.DATABASE_PATH),
  uploadsDir: path.resolve(env.UPLOADS_DIR),
  brandingDir: path.resolve(env.BRANDING_DIR),
  backupsDir: path.resolve(env.BACKUPS_DIR),

  email: {
    ready: emailReady,
    apiKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM || 'CandidatePortal <onboarding@resend.dev>',
  },

  adminBootstrap:
    env.ADMIN_BOOTSTRAP_EMAIL && env.ADMIN_BOOTSTRAP_PASSWORD
      ? { email: env.ADMIN_BOOTSTRAP_EMAIL, password: env.ADMIN_BOOTSTRAP_PASSWORD }
      : null,

  s3:
    env.BACKUP_S3_BUCKET && env.BACKUP_S3_KEY && env.BACKUP_S3_SECRET
      ? {
          endpoint: env.BACKUP_S3_ENDPOINT,
          bucket: env.BACKUP_S3_BUCKET,
          accessKeyId: env.BACKUP_S3_KEY,
          secretAccessKey: env.BACKUP_S3_SECRET,
          region: env.BACKUP_S3_REGION || 'auto',
        }
      : null,
};
