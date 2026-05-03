# CandidatePortal

A simple candidate portal where candidates can self-register their contact info, profile, and CV. The administrator logs in to a separate admin view to search, tag, annotate, and export candidates.

See [SPECIFICATION.md](./SPECIFICATION.md) for the full feature spec.

## Stack

- Node.js 20.6+ (uses native `--env-file`)
- Express 4
- SQLite via `better-sqlite3`
- EJS templates + vanilla JS — no build step
- Pico.css served from CDN

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Set up `.env`

```bash
cp .env.example .env
```

Open `.env` and fill in:

- `SESSION_SECRET` — generate with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `SMTP_USER` / `SMTP_PASS` — Gmail address + 16-char [App Password](https://myaccount.google.com/apppasswords) (requires 2-Step Verification on the Google account)
- `SMTP_FROM` — what appears in the From field, e.g. `CandidatePortal <your.address@gmail.com>`
- `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` — used once at first startup to create the admin user. Clear after the admin exists.

### 3. Run

```bash
npm run dev
```

First start creates `data/database.sqlite`, applies migrations, and bootstraps the admin user. Visit http://localhost:3000.

### Other npm scripts

- `npm run migrate` — apply DB migrations without starting the server
- `npm run create-admin` — interactive CLI that prompts for admin email + password (only works if no admin exists yet)

### Without SMTP configured
If you leave `SMTP_*` empty, verification and reset emails are **logged to the console** instead of being sent. Useful for local dev — copy the verification URL from the terminal.

## Deployment to Railway

1. Push this repo to GitHub.
2. Railway → **New project → Deploy from GitHub** → pick this repo.
3. Add a **Volume** in Settings → Volumes, mounted at `/data`.
4. Set **Environment variables**:

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `BASE_URL` | `https://<your-app>.up.railway.app` |
   | `SESSION_SECRET` | 32+ char random string |
   | `DATABASE_PATH` | `/data/database.sqlite` |
   | `UPLOADS_DIR` | `/data/uploads` |
   | `BRANDING_DIR` | `/data/branding` |
   | `BACKUPS_DIR` | `/data/backups` |
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `465` |
   | `SMTP_SECURE` | `true` |
   | `SMTP_USER` | your Gmail address |
   | `SMTP_PASS` | your 16-char App Password |
   | `SMTP_FROM` | `CandidatePortal <your.address@gmail.com>` |
   | `ADMIN_BOOTSTRAP_EMAIL` | one-time |
   | `ADMIN_BOOTSTRAP_PASSWORD` | one-time, ≥10 chars |

5. *(Optional)* Set `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_KEY`, `BACKUP_S3_SECRET`, `BACKUP_S3_REGION` to push daily backups to an S3-compatible bucket (Backblaze B2, Cloudflare R2, AWS S3).

6. Deploy. Railway auto-detects the Node app via `package.json` and runs `npm start`. The healthcheck path is `/healthz` (configured in `railway.json`).

7. After the first deploy succeeds and admin login works, **clear `ADMIN_BOOTSTRAP_*`** env vars.

## Production cron jobs

When `NODE_ENV=production`, two cron jobs run automatically:

- **Daily backup** at 03:00 Europe/Stockholm — writes `backup-YYYY-MM-DDTHH-mm-ss.zip` to `/data/backups/`, keeps the last 7, optionally pushes to S3.
- **Inactivity cleanup** at 04:00 — sends a warning email to candidates inactive for 351 days; deletes them 14 days after the warning.

In dev mode the cron jobs are disabled.

## Backup & restore

### Manual backup
Log in as admin → Settings → **Ladda ner backup nu**. Downloads a zip with `database.sqlite`, `uploads/`, `branding/`.

### Restore
1. Stop the app.
2. Extract the zip.
3. Replace `database.sqlite` and the `uploads/` + `branding/` directories under your data volume.
4. Start the app.

## Project structure

```
src/
├── server.js        entry point — runs migrations, starts HTTP server, registers cron
├── app.js           Express app + middleware pipeline
├── config.js        env validation
├── db/              SQLite connection + migrations
├── routes/          public, auth, me (candidate), admin, branding
├── middleware/      i18n, csrf, locals, requireAuth/Admin/Candidate
├── services/        email, upload, backup, backup-S3, i18n
├── lib/             tokens, validation, csv
├── jobs/            cron handlers
└── views/           EJS templates
locales/             sv.json, en.json
public/              static assets (CSS, flag icons)
scripts/             create-admin, bootstrap-admin-from-env
data/                local-only: SQLite + uploads + branding + backups (gitignored)
```

## Security notes

- Passwords are hashed with bcrypt (cost 12). Never logged.
- All POST endpoints are CSRF-protected (`csrf-sync`).
- Auth endpoints have rate-limits (5/15min for login, 3/hour for register & forgot-password).
- CV files are served only via auth-protected endpoints; never directly by the static handler.
- Helmet sets `Content-Security-Policy`, `X-Content-Type-Options`, `Strict-Transport-Security`, etc.
- Session cookie: `httpOnly`, `secure` (in prod), `sameSite=lax`.

## License

Private — not for redistribution.
