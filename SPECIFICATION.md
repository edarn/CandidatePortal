# CandidatePortal — Specifikation

> Status: utkast 2026-05-03. Underlag för implementation.

## 1. Syfte
Webbportal där administratören (Thomas) samlar in kontaktuppgifter och CV från personer han träffar ute i jobbet. Personer registrerar sig själva, fyller i profil och laddar upp CV. Admin loggar in i en separat admin-vy och söker, taggar, antecknar, exporterar.

## 2. Roller
- **Admin** — en användare. Egen inlogg på separat URL (`/admin/login`). Skapas via CLI-script, aldrig via webgränssnittet.
- **Kandidat** — registrerar sig själv med e-post + lösenord. E-postverifiering krävs innan första inlogg fungerar.

## 3. Språkstöd
- UI är översatt till **svenska (primär)** och **engelska**.
- Språkbyte sker via en **svensk respektive engelsk flagga i övre högra hörnet** på alla sidor.
- Vald språkinställning sparas i cookie (`locale`, 1 år).
- För inloggade kandidater sparas också preferensen i `candidates.preferred_locale` så att e-post (verifiering, lösenordsreset) skickas på rätt språk.

## 4. Funktioner

### 4.1 Kandidat
- Registrera konto: namn, e-post, telefonnummer, lösenord, samtyckes-checkbox.
- E-postverifiering via tidsbegränsad länk (24 h). Inloggning är blockerad tills e-post är verifierad.
- Logga in / ut.
- Glömt lösenord — engångslänk via e-post (1 h giltig).
- Redigera profil (LinkedIn, nuvarande roll/företag, plats, kort summary).
- Ladda upp / byta CV (PDF eller `.doc`/`.docx`, max 10 MB).
- Radera eget konto (raderar all data inkl. CV-fil från disk).
- Exportera egen data som JSON (`/me/export`) — GDPR rätt till tillgång.

### 4.2 Admin
- Logga in på separat URL.
- Kandidatlista: sökning (namn/e-post), filter (taggar), sortering (datum/namn), paginering.
- Detaljvy per kandidat:
  - All profilinfo + registreringsdatum + e-postverifieringsstatus.
  - **PDF-CV visas inbäddat (inline)** i sidan via `<iframe>` mot `/admin/candidate/:id/cv`.
  - **Word-CV** (`.doc`/`.docx`) visas som nedladdningslänk (ingen inline-preview).
  - Lista och CRUD-hantering av admin-anteckningar (var/när du träffade kandidaten, fritext).
  - Lägg till/ta bort taggar.
- CRUD taggar (skapa, byta namn, ta bort, färgkod).
- Exportera kandidatlista till CSV.
- Ta bort kandidat (raderar samma som kandidatens egen radering).
- Inställningssida:
  - Ladda upp logga (PNG/JPG/SVG, max 2 MB) — visas i sidhuvudet för alla.
  - Knapp för manuell backup (zip-nedladdning).

### 4.3 Backup
- **Manuell backup** via admin-knapp: streamar zip med `database.sqlite` + alla filer under `uploads/`.
- **Schemalagd daglig backup** via `node-cron` kl 03:00. Skrivs till `backups/`. Max 7 senaste behålls (rolling).
- **Valfri push till S3-kompatibel lagring** (Backblaze B2, Cloudflare R2, AWS S3) om miljövariabler `BACKUP_S3_*` är satta.

## 5. Obligatoriska kandidatfält
Vid registrering:
- Fullständigt namn
- E-postadress (unik)
- Telefonnummer
- Lösenord (min 10 tecken, ej enbart siffror, kontroll mot lista över vanligaste svaga lösenord)
- Samtyckes-checkbox (bockad ⇒ samtycke)

Övriga fält (LinkedIn, roll, företag, plats, summary) fylls i på `/me` efter inloggning.

## 6. Datamodell

```sql
users
  id INTEGER PK
  email TEXT UNIQUE NOT NULL
  password_hash TEXT NOT NULL
  role TEXT NOT NULL CHECK(role IN ('admin','candidate'))
  email_verified_at TEXT NULL
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))

candidates
  user_id INTEGER PK FK → users(id) ON DELETE CASCADE
  full_name TEXT NOT NULL
  phone TEXT NOT NULL
  linkedin_url TEXT NULL
  current_role TEXT NULL
  current_company TEXT NULL
  location TEXT NULL
  summary TEXT NULL
  cv_filename TEXT NULL          -- slumpgenererat (UUID) namn på disk
  cv_original_name TEXT NULL
  cv_mime_type TEXT NULL
  cv_uploaded_at TEXT NULL
  preferred_locale TEXT NOT NULL DEFAULT 'sv'
  consent_given_at TEXT NOT NULL
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))

admin_notes
  id INTEGER PK
  candidate_user_id INTEGER FK → users(id) ON DELETE CASCADE
  note_text TEXT NOT NULL
  met_at_location TEXT NULL
  met_at_date TEXT NULL
  created_at TEXT NOT NULL DEFAULT (datetime('now'))

tags
  id INTEGER PK
  name TEXT UNIQUE NOT NULL
  color TEXT NULL                -- hex, t.ex. '#3b82f6'

candidate_tags
  candidate_user_id INTEGER FK → users(id) ON DELETE CASCADE
  tag_id INTEGER FK → tags(id) ON DELETE CASCADE
  PRIMARY KEY (candidate_user_id, tag_id)

email_verifications
  token TEXT PK
  user_id INTEGER FK → users(id) ON DELETE CASCADE
  expires_at TEXT NOT NULL

password_resets
  token TEXT PK
  user_id INTEGER FK → users(id) ON DELETE CASCADE
  expires_at TEXT NOT NULL
  used_at TEXT NULL

settings
  key TEXT PK
  value TEXT NOT NULL
  -- nyckel-exempel: logo_filename, logo_original_name, logo_mime_type

deletion_log
  id INTEGER PK
  user_id INTEGER NOT NULL       -- ej FK (användaren är borta)
  deleted_at TEXT NOT NULL
  reason TEXT NULL               -- 'self', 'admin', 'inactivity'

sessions                         -- hanteras av better-sqlite3-session-store
```

## 7. URL-karta

```
Publikt
  GET  /                           landning
  GET  /privacy                    integritetspolicy
  GET  /register
  POST /register
  GET  /verify-email?token=…
  GET  /login
  POST /login
  POST /logout
  GET  /forgot-password
  POST /forgot-password
  GET  /reset-password?token=…
  POST /reset-password

Admin
  GET  /admin/login
  POST /admin/login
  GET  /admin                      kandidatlista
  GET  /admin/candidate/:id
  POST /admin/candidate/:id/notes
  POST /admin/notes/:id/delete
  POST /admin/candidate/:id/tags
  POST /admin/candidate/:id/delete
  GET  /admin/candidate/:id/cv     auth-skyddad CV-leverans (inline för PDF)
  GET  /admin/tags
  POST /admin/tags                 skapa
  POST /admin/tags/:id             redigera
  POST /admin/tags/:id/delete
  GET  /admin/export.csv
  GET  /admin/settings
  POST /admin/settings/logo
  POST /admin/settings/logo/delete
  GET  /admin/backup               ladda ner zip nu

Kandidat (inloggad)
  GET  /me
  POST /me
  POST /me/cv                      ladda upp CV
  GET  /me/cv                      ladda ner egen CV
  POST /me/cv/delete
  GET  /me/export                  egen data som JSON
  POST /me/delete

Övrigt
  GET  /locale/:lang               sätt språk-cookie + redirect till `Referer`
  GET  /branding/logo              levererar uppladdad logga (cachebar)
  GET  /healthz                    200 OK för Railway healthcheck
```

## 8. Tekniska val

| Lager | Val | Motivering |
|---|---|---|
| Runtime | Node.js 20 LTS | En stack, ett språk |
| Webramverk | Express 4 | Minst friktion |
| Databas | SQLite via `better-sqlite3` | En fil, synkron, snabb |
| Sessions | `express-session` + `better-sqlite3-session-store` | Persistens i samma DB |
| Lösenord | `bcrypt` (cost 12) | Standard |
| Filuppladdning | `multer` | Standard |
| E-post | `nodemailer` | Standard |
| Validering | `zod` | Typad, läsbar |
| CSRF | `csrf-sync` | Fungerar med express-session |
| Rate limit | `express-rate-limit` | Standard |
| Schemaläggning | `node-cron` | För daglig backup + GDPR-rensning |
| Zip | `archiver` | Streamar utan att läsa in i minnet |
| Templates | `ejs` | Server-renderat, ingen build |
| CSS | Pico.css | Klasslös, snyggt direkt |
| i18n | Eget enkelt JSON-baserat | Slipper i18next-overhead |
| Logger | `pino` | Snabb, JSON-loggar |
| Säkerhetsheaders | `helmet` | Standard |

## 9. Säkerhet
- bcrypt cost 12.
- HTTPS hanteras av Railway automatiskt.
- CSRF-token på alla POST.
- Rate limit:
  - Login (admin & kandidat): 5 försök / 15 min / IP.
  - Register & forgot-password: 3 / timme / IP.
- Zod-validering på all input.
- CV-filer serveras endast via auth-skyddad endpoint, aldrig som statiska filer.
- Uppladdning kontrollerar MIME (via filinnehåll, inte enbart `Content-Type`-header), ändelse, max 10 MB, slumpgenererat filnamn (UUID v4 + ändelse).
- Logga upload max 2 MB, MIME `image/png|jpeg|svg+xml`. SVG saneras (ta bort `<script>`).
- Adminkonto skapas via `node scripts/create-admin.js` (eller env-vars `ADMIN_BOOTSTRAP_EMAIL`/`_PASSWORD` vid första uppstart).
- Cookies: `httpOnly`, `secure` (i prod), `sameSite=lax`.
- Session-secret från env-var (`SESSION_SECRET`), minst 32 tecken.
- HTTP-headers via `helmet` (default policy).
- Verifierings- och resetlänkar använder kryptografiskt slumpade tokens (32 byte URL-safe), engångsanvändning.

## 10. GDPR
- **Integritetspolicy** publicerad på `/privacy` (svenska + engelska).
- **Samtycke** vid registrering: checkbox med länk till policyn. Tidsstämpel sparas i `candidates.consent_given_at`.
- **Rätt till radering**: `/me/delete` → CASCADE-radering + CV-fil från disk + rad i `deletion_log`.
- **Rätt till tillgång**: `/me/export` levererar all kandidatens data som JSON.
- **Lagringstid**: 12 månader inaktivitet (ingen inlogg, ingen profilredigering) → automatisk radering. Kandidat varnas via mejl 14 dagar innan. Schemalagd via cron, kör dagligen kl 04:00.
- Vid radering loggas händelsen utan PII (bara `user_id` + tidsstämpel + orsak) i `deletion_log` — för att kunna styrka att radering skett.
- Vid byte av e-post-tjänst eller hosting utanför EU ska personuppgiftsbiträdesavtal finnas.

## 11. Deployment (Railway)
- Build via Nixpacks (auto-detect Node.js).
- **Persistent volume** monterad på `/data`:
  - `/data/database.sqlite`
  - `/data/uploads/` (CV-filer)
  - `/data/branding/` (logo)
  - `/data/backups/` (rolling 7 dagars backuper)
- **Miljövariabler**:
  - `NODE_ENV=production`
  - `BASE_URL` (t.ex. `https://candidateportal.up.railway.app`)
  - `SESSION_SECRET` (krävs, ≥ 32 tecken)
  - `DATABASE_PATH=/data/database.sqlite`
  - `UPLOADS_DIR=/data/uploads`
  - `BRANDING_DIR=/data/branding`
  - `BACKUPS_DIR=/data/backups`
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
  - `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` (engångs, för första admin)
  - `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_KEY`, `BACKUP_S3_SECRET`, `BACKUP_S3_REGION` (valfria)
- `GET /healthz` returnerar 200 OK för Railway healthcheck.

## 12. Projektstruktur

```
CandidatePortal/
├── src/
│   ├── server.js                  entry — startar HTTP-server
│   ├── app.js                     Express-app + middleware-pipeline
│   ├── config.js                  env-läsning + validering
│   ├── db/
│   │   ├── connection.js          better-sqlite3-instans (singleton)
│   │   ├── migrate.js             migrations-runner
│   │   └── migrations/
│   │       ├── 001_init.sql
│   │       ├── 002_notes_tags.sql
│   │       ├── 003_tokens.sql
│   │       ├── 004_settings.sql
│   │       └── 005_deletion_log.sql
│   ├── routes/
│   │   ├── public.js              /, /privacy, /healthz, /locale/:lang
│   │   ├── auth.js                /register, /login, /logout, /verify-email, /forgot-password, /reset-password
│   │   ├── me.js                  kandidat self-service
│   │   ├── admin.js               admin-vyer
│   │   └── branding.js            /branding/logo
│   ├── middleware/
│   │   ├── requireAuth.js
│   │   ├── requireAdmin.js
│   │   ├── requireCandidate.js
│   │   ├── csrf.js
│   │   ├── i18n.js
│   │   └── locals.js              fyller res.locals (user, t, locale, branding)
│   ├── services/
│   │   ├── email.js               nodemailer-wrapper + mall-rendering
│   │   ├── upload.js              multer-config för CV och logo
│   │   ├── backup.js              zip-skapande + S3-push
│   │   └── i18n.js                laddar locales/*.json, t(key, vars)
│   ├── lib/
│   │   ├── tokens.js              kryptografiska tokens
│   │   ├── validation.js          delade zod-scheman
│   │   └── csv.js                 CSV-export
│   ├── jobs/
│   │   ├── dailyBackup.js
│   │   └── inactivityCleanup.js
│   └── views/
│       ├── layout.ejs
│       ├── partials/
│       │   ├── header.ejs         logga + språkväljare
│       │   ├── footer.ejs
│       │   └── flash.ejs
│       ├── public/
│       ├── auth/
│       ├── candidate/
│       └── admin/
├── public/                        statiska filer (CSS, klient-JS, flagg-ikoner)
├── locales/
│   ├── sv.json
│   └── en.json
├── scripts/
│   ├── create-admin.js
│   └── bootstrap-admin-from-env.js
├── tests/                         smoke-tester (valfritt)
├── package.json
├── .env.example
├── .gitignore
├── nixpacks.toml                  (eller railway.toml)
├── README.md                      körinstruktioner
└── SPECIFICATION.md               detta dokument
```

I lokalt utvecklingsläge är `/data`-paths ersatta med relativa: `./data/...`.
