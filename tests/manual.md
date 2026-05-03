# Manual test checklist

Walk through this list before each release. Items with `[Y]` mean "verified during automated end-to-end smoke test in dev"; `[ ]` means "needs human eyes".

## Setup

- [Y] `npm install` succeeds on a clean checkout
- [Y] `npm run migrate` applies all 6 migrations on an empty DB
- [Y] `npm run dev` starts on port 3000 without errors
- [ ] Browser shows landing page with logo placeholder + Swedish copy
- [ ] Clicking the EN flag in the top right switches to English; the SV flag switches back
- [ ] The selected flag is visually highlighted

## Public pages

- [Y] `GET /` returns 200 with localized title
- [Y] `GET /privacy` renders the Swedish policy when `locale=sv`, English when `locale=en`
- [Y] `GET /healthz` returns plain `ok`

## Candidate registration

- [Y] `POST /register` with valid data creates a user and redirects to "verify pending"
- [Y] Verification URL is logged to the console in dev when SMTP is unset
- [Y] `GET /verify-email?token=…` marks the user verified and shows success
- [Y] `POST /register` rejects a duplicate email (400)
- [Y] `POST /register` rejects a too-short / too-common password (400)
- [Y] `POST /register` without CSRF token returns 403
- [ ] Consent checkbox is visible and required
- [ ] Privacy-link in the consent label opens `/privacy` in a new tab

## Candidate login & profile

- [Y] `POST /login` with correct password redirects to `/me`
- [Y] `POST /login` with wrong password returns 401 with `errors.invalidCredentials`
- [Y] Login is blocked until the email is verified (403 + `errors.notVerified`)
- [Y] `GET /me` shows pre-filled profile after first login
- [Y] `POST /me` updates the profile (verified by re-fetching `/me`)
- [Y] Flash "Sparad." shows after save
- [ ] Email field is read-only (disabled input)

## CV upload

- [Y] Upload of a small fake PDF succeeds
- [Y] CV download (`GET /me/cv/download`) returns the same bytes with `Content-Type: application/pdf`
- [ ] Upload of a `.docx` file succeeds and the candidate detail page shows a download button (no inline preview)
- [ ] Upload of a `.txt` is rejected (flash error)
- [ ] Upload of a >10MB file is rejected (flash error)

## Candidate self-deletion / GDPR

- [Y] `GET /me/export` returns JSON with profile, admin_notes, tags
- [ ] `POST /me/delete` with confirm `RADERA` deletes the account, removes the CV file, redirects to `/`
- [ ] After deletion, `POST /login` with the old credentials fails

## Admin login

- [Y] Bootstrap admin from env vars works on first start
- [Y] `POST /admin/login` with correct credentials redirects to `/admin`
- [ ] Logging in as a *candidate* via `/admin/login` returns 401
- [ ] Logging in as the admin via `/login` (the candidate route) returns 401

## Admin candidate management

- [Y] `GET /admin` lists candidates with name, email, phone, tag pills, registration date
- [Y] Search by name filters the list
- [ ] Filter by tag filters the list
- [Y] Pagination shows when total > 25
- [Y] `GET /admin/candidate/:id` shows full profile + tag checkboxes + notes form
- [Y] PDF CV is rendered inline via `<iframe>` on the detail page
- [ ] Word CV (.doc/.docx) shows download link instead of preview
- [Y] Adding a note via the form persists and shows the note
- [Y] Deleting a note removes it
- [Y] Tag selection (POST `/admin/candidate/:id/tags`) replaces existing tags
- [Y] CSV export downloads with UTF-8 BOM and proper headers

## Tags

- [Y] `POST /admin/tags` creates a new tag
- [ ] `POST /admin/tags/:id` renames / recolors a tag
- [ ] `POST /admin/tags/:id/delete` removes the tag from all candidates
- [ ] Duplicate tag name is rejected with a flash error

## Settings (logo + backup)

- [ ] Upload a PNG logo → it appears in the header on every page
- [ ] Upload an SVG logo → embedded scripts in the SVG are stripped
- [ ] Logo deletion removes it from the header
- [Y] `GET /admin/backup` downloads a valid zip containing `database.sqlite` + `uploads/` + (optionally) `branding/`

## Internationalization

- [Y] All visible text on `/`, `/login`, `/register`, `/me`, `/admin/login`, `/privacy` is translated when toggling SV ↔ EN
- [ ] Email subjects are localized (`Verifiera din e-post` vs `Verify your email`)

## Security smoke tests

- [Y] CSRF: `POST /login` without `_csrf` returns 403
- [ ] Session cookie has `HttpOnly`, `SameSite=Lax`, `Secure` in production
- [ ] CV download is denied when not logged in (302 to `/login`)
- [ ] Logged-in candidate cannot fetch `/admin/candidate/2/cv`
- [ ] Helmet sets `X-Content-Type-Options: nosniff` and `Strict-Transport-Security`

## Backup & restore (production-like)

- [ ] Take a manual backup, then add a new candidate
- [ ] Restore the backup over a fresh data volume
- [ ] Verify the restored DB does NOT contain the new candidate (i.e. point-in-time restore worked)
- [ ] Verify uploaded CV files are restored to the correct paths

## Deployment (Railway)

- [ ] First deploy succeeds with `railway.json` and a Volume mounted at `/data`
- [ ] Healthcheck `/healthz` passes
- [ ] Cron jobs log "scheduled at 03:00 / 04:00 Europe/Stockholm" on production boot
- [ ] After clearing `ADMIN_BOOTSTRAP_*`, restart still boots normally (admin already exists)
