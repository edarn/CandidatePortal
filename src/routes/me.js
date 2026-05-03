import express from 'express';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import db from '../db/connection.js';
import { csrfProtection } from '../middleware/csrf.js';
import { requireCandidate } from '../middleware/requireCandidate.js';
import { setFlash } from '../middleware/locals.js';
import {
  fullNameSchema,
  phoneSchema,
  linkedinSchema,
  shortTextSchema,
  longTextSchema,
  flattenZodErrors,
} from '../lib/validation.js';
import { cvUpload } from '../services/upload.js';
import { config } from '../config.js';

const router = express.Router();
router.use(requireCandidate);

const findCandidate = db.prepare(`
  SELECT u.id AS user_id, u.email, u.email_verified_at, u.created_at AS registered_at,
         c.full_name, c.phone, c.linkedin_url, c.current_role, c.current_company,
         c.location, c.summary, c.cv_filename, c.cv_original_name, c.cv_mime_type,
         c.cv_uploaded_at, c.preferred_locale, c.consent_given_at, c.updated_at
  FROM users u JOIN candidates c ON c.user_id = u.id
  WHERE u.id = ?
`);

const updateCandidate = db.prepare(`
  UPDATE candidates SET
    full_name = ?, phone = ?, linkedin_url = ?, current_role = ?,
    current_company = ?, location = ?, summary = ?, preferred_locale = ?,
    updated_at = datetime('now')
  WHERE user_id = ?
`);

const updateCv = db.prepare(`
  UPDATE candidates SET
    cv_filename = ?, cv_original_name = ?, cv_mime_type = ?,
    cv_uploaded_at = datetime('now'), updated_at = datetime('now')
  WHERE user_id = ?
`);

const clearCv = db.prepare(`
  UPDATE candidates SET
    cv_filename = NULL, cv_original_name = NULL, cv_mime_type = NULL,
    cv_uploaded_at = NULL, updated_at = datetime('now')
  WHERE user_id = ?
`);

const deleteUser = db.prepare('DELETE FROM users WHERE id = ?');
const insertDeletionLog = db.prepare(
  "INSERT INTO deletion_log (user_id, reason) VALUES (?, 'self')",
);

const getNotes = db.prepare(
  'SELECT note_text, met_at_location, met_at_date, created_at FROM admin_notes WHERE candidate_user_id = ? ORDER BY created_at',
);
const getTags = db.prepare(`
  SELECT t.name, t.color FROM tags t
  JOIN candidate_tags ct ON ct.tag_id = t.id
  WHERE ct.candidate_user_id = ?
  ORDER BY t.name
`);

const profileSchema = z.object({
  full_name: fullNameSchema,
  phone: phoneSchema,
  linkedin_url: linkedinSchema,
  current_role: shortTextSchema,
  current_company: shortTextSchema,
  location: shortTextSchema,
  summary: longTextSchema,
});

const emptyToNull = (v) => (v && v.length ? v : null);

router.get('/', (req, res) => {
  const cand = findCandidate.get(req.session.user.id);
  res.render('candidate/me', { candidate: cand, values: cand, errors: {} });
});

router.post('/', csrfProtection, (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    const cand = findCandidate.get(req.session.user.id);
    return res.status(400).render('candidate/me', {
      candidate: cand,
      values: req.body,
      errors: flattenZodErrors(parsed.error),
    });
  }
  const data = parsed.data;
  updateCandidate.run(
    data.full_name,
    data.phone,
    emptyToNull(data.linkedin_url),
    emptyToNull(data.current_role),
    emptyToNull(data.current_company),
    emptyToNull(data.location),
    emptyToNull(data.summary),
    req.locale,
    req.session.user.id,
  );
  setFlash(req, 'success', res.locals.t('me.saved'));
  res.redirect('/me');
});

router.get('/cv', (req, res) => {
  const cand = findCandidate.get(req.session.user.id);
  res.render('candidate/cv', { candidate: cand });
});

router.post('/cv', cvUpload, csrfProtection, (req, res) => {
  if (req.uploadError) {
    setFlash(
      req,
      'error',
      res.locals.t(
        req.uploadError.code === 'LIMIT_FILE_SIZE'
          ? 'errors.fileTooBig'
          : 'errors.fileType',
      ),
    );
    return res.redirect('/me/cv');
  }
  if (!req.file) {
    setFlash(req, 'error', res.locals.t('errors.fileType'));
    return res.redirect('/me/cv');
  }

  const cand = findCandidate.get(req.session.user.id);
  if (cand?.cv_filename) {
    fs.unlink(path.join(config.uploadsDir, cand.cv_filename), () => {});
  }
  updateCv.run(
    req.file.filename,
    req.file.originalname,
    req.file.mimetype,
    req.session.user.id,
  );
  setFlash(req, 'success', res.locals.t('me.saved'));
  res.redirect('/me/cv');
});

router.get('/cv/download', (req, res) => {
  const cand = findCandidate.get(req.session.user.id);
  if (!cand?.cv_filename) return res.status(404).end();
  const filePath = path.join(config.uploadsDir, cand.cv_filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.type(cand.cv_mime_type || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(cand.cv_original_name || 'cv')}"`,
  );
  fs.createReadStream(filePath).pipe(res);
});

router.post('/cv/delete', csrfProtection, (req, res) => {
  const cand = findCandidate.get(req.session.user.id);
  if (cand?.cv_filename) {
    fs.unlink(path.join(config.uploadsDir, cand.cv_filename), () => {});
    clearCv.run(req.session.user.id);
  }
  res.redirect('/me/cv');
});

router.get('/export', (req, res) => {
  const userId = req.session.user.id;
  const cand = findCandidate.get(userId);
  const notes = getNotes.all(userId);
  const tags = getTags.all(userId);

  const payload = {
    profile: cand,
    admin_notes: notes,
    tags,
    exported_at: new Date().toISOString(),
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="my-data.json"',
  );
  res.send(JSON.stringify(payload, null, 2));
});

router.get('/delete', (req, res) => {
  res.render('candidate/delete', { error: null });
});

router.post('/delete', csrfProtection, (req, res) => {
  const confirm = (req.body?.confirm || '').trim().toUpperCase();
  if (!['RADERA', 'DELETE'].includes(confirm)) {
    return res.status(400).render('candidate/delete', {
      error: 'errors.deleteConfirmWrong',
    });
  }

  const userId = req.session.user.id;
  const cand = findCandidate.get(userId);

  const tx = db.transaction(() => {
    deleteUser.run(userId);
    insertDeletionLog.run(userId);
  });
  tx();

  if (cand?.cv_filename) {
    fs.unlink(path.join(config.uploadsDir, cand.cv_filename), () => {});
  }

  req.session.destroy(() => {
    res.clearCookie('cp.sid');
    res.redirect('/');
  });
});

export default router;
