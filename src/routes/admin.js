import express from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import sanitizeHtml from 'sanitize-html';
import rateLimit from 'express-rate-limit';
import db from '../db/connection.js';
import { config } from '../config.js';
import { csrfProtection } from '../middleware/csrf.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { setFlash } from '../middleware/locals.js';
import {
  emailSchema,
  tagNameSchema,
  tagColorSchema,
  flattenZodErrors,
} from '../lib/validation.js';
import { logoUpload } from '../services/upload.js';
import { toCsv } from '../lib/csv.js';
import { streamBackupTo } from '../services/backup.js';

const router = express.Router();

const PAGE_SIZE = 25;
const SORT_MAP = {
  date_desc: 'u.created_at DESC',
  date_asc: 'u.created_at ASC',
  name: 'c.full_name COLLATE NOCASE ASC',
  name_desc: 'c.full_name COLLATE NOCASE DESC',
};

// =============================================================
// Login (no requireAdmin)
// =============================================================

const findUserByEmail = db.prepare(
  'SELECT id, email, password_hash, role FROM users WHERE email = ?',
);

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    setFlash(req, 'error', res.locals.t('errors.rateLimited'));
    res.redirect('/admin/login');
  },
});

const adminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

router.get('/login', (req, res) => {
  if (req.session.user?.role === 'admin') return res.redirect('/admin');
  res.render('admin/login', { values: {}, errors: {} });
});

router.post('/login', csrfProtection, adminLoginLimiter, async (req, res) => {
  const parsed = adminLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).render('admin/login', {
      values: req.body,
      errors: flattenZodErrors(parsed.error),
    });
  }
  const { email, password } = parsed.data;
  const user = findUserByEmail.get(email);

  const renderInvalid = () =>
    res.status(401).render('admin/login', {
      values: { email },
      errors: { _form: 'errors.invalidCredentials' },
    });

  if (!user || user.role !== 'admin') {
    if (user) await bcrypt.compare(password, user.password_hash);
    return renderInvalid();
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return renderInvalid();

  const returnTo = req.session.returnTo;
  req.session.regenerate((err) => {
    if (err) return res.status(500).render('errors/500');
    req.session.user = { id: user.id, email: user.email, role: user.role };
    req.session.save((err2) => {
      if (err2) return res.status(500).render('errors/500');
      const target = returnTo && returnTo.startsWith('/admin') ? returnTo : '/admin';
      res.redirect(target);
    });
  });
});

// =============================================================
// Everything below requires admin
// =============================================================

router.use(requireAdmin);

// --- prepared statements ---
const findCandidateById = db.prepare(`
  SELECT u.id AS user_id, u.email, u.email_verified_at, u.created_at,
         c.full_name, c.phone, c.linkedin_url, c.current_role, c.current_company,
         c.location, c.summary, c.cv_filename, c.cv_original_name, c.cv_mime_type,
         c.cv_uploaded_at
  FROM users u JOIN candidates c ON c.user_id = u.id
  WHERE u.id = ? AND u.role = 'candidate'
`);

const getNotes = db.prepare(
  'SELECT id, note_text, met_at_location, met_at_date, created_at FROM admin_notes WHERE candidate_user_id = ? ORDER BY created_at DESC',
);
const insertNote = db.prepare(
  'INSERT INTO admin_notes (candidate_user_id, note_text, met_at_location, met_at_date) VALUES (?, ?, ?, ?)',
);
const deleteNote = db.prepare('DELETE FROM admin_notes WHERE id = ?');

const allTags = db.prepare('SELECT id, name, color FROM tags ORDER BY name COLLATE NOCASE');

const getStats = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM users WHERE role = 'candidate') AS total_candidates,
    (SELECT COUNT(*) FROM users WHERE role = 'candidate' AND email_verified_at IS NOT NULL) AS verified_count,
    (SELECT COUNT(*) FROM tags) AS tags_count,
    (SELECT COUNT(*) FROM users WHERE role = 'candidate' AND created_at > datetime('now', '-7 days')) AS new_this_week
`);
const tagsForCandidate = db.prepare(
  'SELECT tag_id FROM candidate_tags WHERE candidate_user_id = ?',
);
const insertTag = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)');
const updateTag = db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?');
const deleteTag = db.prepare('DELETE FROM tags WHERE id = ?');
const clearCandidateTags = db.prepare(
  'DELETE FROM candidate_tags WHERE candidate_user_id = ?',
);
const linkTag = db.prepare(
  'INSERT OR IGNORE INTO candidate_tags (candidate_user_id, tag_id) VALUES (?, ?)',
);

const deleteUser = db.prepare('DELETE FROM users WHERE id = ?');
const insertDeletionLogAdmin = db.prepare(
  "INSERT INTO deletion_log (user_id, reason) VALUES (?, 'admin')",
);

const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const upsertSetting = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
);
const deleteSetting = db.prepare('DELETE FROM settings WHERE key = ?');

// =============================================================
// List
// =============================================================

function buildListQuery({ q, tag, sort, page, pageSize }) {
  const conditions = ["u.role = 'candidate'"];
  const params = [];
  if (q && q.trim()) {
    conditions.push('(c.full_name LIKE ? OR u.email LIKE ?)');
    params.push(`%${q.trim()}%`, `%${q.trim()}%`);
  }
  if (tag) {
    conditions.push(
      'u.id IN (SELECT candidate_user_id FROM candidate_tags WHERE tag_id = ?)',
    );
    params.push(Number(tag));
  }
  const where = 'WHERE ' + conditions.join(' AND ');
  const orderBy = SORT_MAP[sort] || SORT_MAP.date_desc;

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS total FROM users u JOIN candidates c ON c.user_id = u.id ${where}`,
    )
    .get(...params);

  const offset = (page - 1) * pageSize;
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.email_verified_at, u.created_at,
              c.full_name, c.phone, c.location,
              (SELECT GROUP_CONCAT(t.name, ',') FROM tags t
               JOIN candidate_tags ct ON ct.tag_id = t.id
               WHERE ct.candidate_user_id = u.id) AS tag_names
       FROM users u JOIN candidates c ON c.user_id = u.id
       ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, offset);

  return { rows, total: totalRow.total };
}

router.get('/', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const tag = typeof req.query.tag === 'string' ? req.query.tag : '';
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'date_desc';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  const { rows, total } = buildListQuery({ q, tag, sort, page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const currentParams = { q, tag, sort };

  // Live-search fragment: just the table + pagination
  if (req.query.fragment === '1') {
    res.set('X-Total-Count', String(total));
    return res.render('admin/list-fragment', {
      rows,
      total,
      page,
      totalPages,
      currentParams,
    });
  }

  const csvQuery = Object.entries(currentParams)
    .filter(([, v]) => v !== '' && v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

  res.render('admin/list', {
    rows,
    total,
    page,
    totalPages,
    currentParams,
    csvQuery,
    allTags: allTags.all(),
    stats: getStats.get(),
  });
});

// =============================================================
// Candidate detail
// =============================================================

router.get('/candidate/:id', (req, res) => {
  const id = Number(req.params.id);
  const candidate = findCandidateById.get(id);
  if (!candidate) return res.status(404).render('errors/404');

  const notes = getNotes.all(id);
  const currentTagIds = new Set(tagsForCandidate.all(id).map((r) => r.tag_id));
  const tags = allTags.all();

  res.render('admin/candidate-detail', {
    candidate,
    notes,
    allTags: tags,
    currentTagIds,
  });
});

// --- Notes ---

const noteSchema = z.object({
  note_text: z.string().trim().min(1).max(5000),
  met_at_location: z.string().trim().max(200).optional().or(z.literal('')),
  met_at_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
});

router.post('/candidate/:id/notes', csrfProtection, (req, res) => {
  const id = Number(req.params.id);
  const candidate = findCandidateById.get(id);
  if (!candidate) return res.status(404).render('errors/404');

  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) {
    setFlash(req, 'error', res.locals.t('errors.generic'));
    return res.redirect(`/admin/candidate/${id}`);
  }
  const data = parsed.data;
  insertNote.run(
    id,
    data.note_text,
    data.met_at_location || null,
    data.met_at_date || null,
  );
  setFlash(req, 'success', res.locals.t('admin.list.noteAdded'));
  res.redirect(`/admin/candidate/${id}`);
});

router.post('/notes/:id/delete', csrfProtection, (req, res) => {
  const noteId = Number(req.params.id);
  const note = db
    .prepare('SELECT candidate_user_id FROM admin_notes WHERE id = ?')
    .get(noteId);
  deleteNote.run(noteId);
  res.redirect(note ? `/admin/candidate/${note.candidate_user_id}` : '/admin');
});

// --- Tags assignment on candidate ---

router.post('/candidate/:id/tags', csrfProtection, (req, res) => {
  const id = Number(req.params.id);
  const candidate = findCandidateById.get(id);
  if (!candidate) return res.status(404).render('errors/404');

  let ids = req.body.tag_ids;
  if (!ids) ids = [];
  else if (!Array.isArray(ids)) ids = [ids];
  const numericIds = ids
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);

  const tx = db.transaction(() => {
    clearCandidateTags.run(id);
    for (const tagId of numericIds) {
      linkTag.run(id, tagId);
    }
  });
  tx();
  res.redirect(`/admin/candidate/${id}`);
});

// --- Candidate deletion ---

router.post('/candidate/:id/delete', csrfProtection, (req, res) => {
  const id = Number(req.params.id);
  const candidate = findCandidateById.get(id);
  if (!candidate) return res.status(404).render('errors/404');

  const tx = db.transaction(() => {
    deleteUser.run(id);
    insertDeletionLogAdmin.run(id);
  });
  tx();

  if (candidate.cv_filename) {
    fs.unlink(path.join(config.uploadsDir, candidate.cv_filename), () => {});
  }

  setFlash(req, 'info', `Deleted ${candidate.full_name}`);
  res.redirect('/admin');
});

// --- CV serving ---

router.get('/candidate/:id/cv', (req, res) => {
  const id = Number(req.params.id);
  const candidate = findCandidateById.get(id);
  if (!candidate?.cv_filename) return res.status(404).end();
  const filePath = path.join(config.uploadsDir, candidate.cv_filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();

  const inline = candidate.cv_mime_type === 'application/pdf' && !req.query.download;
  res.type(candidate.cv_mime_type || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(candidate.cv_original_name || 'cv')}"`,
  );
  fs.createReadStream(filePath).pipe(res);
});

// =============================================================
// Tags CRUD
// =============================================================

const tagInputSchema = z.object({
  name: tagNameSchema,
  color: tagColorSchema,
});

router.get('/tags', (req, res) => {
  res.render('admin/tags', { tags: allTags.all() });
});

router.post('/tags', csrfProtection, (req, res) => {
  const parsed = tagInputSchema.safeParse(req.body);
  if (!parsed.success) {
    setFlash(req, 'error', res.locals.t('errors.generic'));
    return res.redirect('/admin/tags');
  }
  try {
    insertTag.run(parsed.data.name, parsed.data.color || null);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      setFlash(req, 'error', 'Tag name already exists');
    } else {
      throw err;
    }
  }
  res.redirect('/admin/tags');
});

router.post('/tags/:id', csrfProtection, (req, res) => {
  const id = Number(req.params.id);
  const parsed = tagInputSchema.safeParse(req.body);
  if (!parsed.success) {
    setFlash(req, 'error', res.locals.t('errors.generic'));
    return res.redirect('/admin/tags');
  }
  updateTag.run(parsed.data.name, parsed.data.color || null, id);
  res.redirect('/admin/tags');
});

router.post('/tags/:id/delete', csrfProtection, (req, res) => {
  deleteTag.run(Number(req.params.id));
  res.redirect('/admin/tags');
});

// =============================================================
// Settings (logo)
// =============================================================

router.get('/settings', (req, res) => {
  res.render('admin/settings');
});

router.post('/settings/logo', logoUpload, csrfProtection, async (req, res) => {
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
    return res.redirect('/admin/settings');
  }
  if (!req.file) {
    setFlash(req, 'error', res.locals.t('errors.fileType'));
    return res.redirect('/admin/settings');
  }

  // Sanitize SVG content to strip embedded scripts
  if (req.file.mimetype === 'image/svg+xml') {
    const filePath = path.join(config.brandingDir, req.file.filename);
    const original = fs.readFileSync(filePath, 'utf8');
    const cleaned = sanitizeHtml(original, {
      allowedTags: [
        'svg', 'g', 'defs', 'symbol', 'use', 'path', 'rect', 'circle',
        'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
        'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask',
      ],
      allowedAttributes: false,
      parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
    });
    fs.writeFileSync(filePath, cleaned, 'utf8');
  }

  // Remove old logo from disk
  const oldFilename = getSetting.get('logo_filename')?.value;
  if (oldFilename && oldFilename !== req.file.filename) {
    fs.unlink(path.join(config.brandingDir, oldFilename), () => {});
  }

  upsertSetting.run('logo_filename', req.file.filename);
  upsertSetting.run('logo_original_name', req.file.originalname);
  upsertSetting.run('logo_mime_type', req.file.mimetype);

  res.redirect('/admin/settings');
});

router.post('/settings/logo/delete', csrfProtection, (req, res) => {
  const filename = getSetting.get('logo_filename')?.value;
  if (filename) {
    fs.unlink(path.join(config.brandingDir, filename), () => {});
  }
  deleteSetting.run('logo_filename');
  deleteSetting.run('logo_original_name');
  deleteSetting.run('logo_mime_type');
  res.redirect('/admin/settings');
});

// =============================================================
// Manual backup download
// =============================================================

router.get('/backup', async (req, res) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="candidate-portal-backup-${stamp}.zip"`,
  );
  try {
    await streamBackupTo(res);
  } catch (err) {
    console.error('Backup failed:', err);
    if (!res.headersSent) res.status(500).end();
  }
});

// =============================================================
// CSV export
// =============================================================

router.get('/export.csv', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const tag = typeof req.query.tag === 'string' ? req.query.tag : '';
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'date_desc';

  const { rows } = buildListQuery({ q, tag, sort, page: 1, pageSize: 1000000 });

  // Enrich with tags + extra fields for export
  const detail = db.prepare(`
    SELECT u.id, u.email, u.email_verified_at, u.created_at,
           c.full_name, c.phone, c.linkedin_url, c.current_role,
           c.current_company, c.location, c.summary,
           (SELECT GROUP_CONCAT(t.name, ', ') FROM tags t
            JOIN candidate_tags ct ON ct.tag_id = t.id
            WHERE ct.candidate_user_id = u.id) AS tag_names
    FROM users u JOIN candidates c ON c.user_id = u.id
    WHERE u.id = ?
  `);
  const detailed = rows.map((r) => detail.get(r.id));

  const columns = [
    { header: 'Name', value: 'full_name' },
    { header: 'Email', value: 'email' },
    { header: 'Phone', value: 'phone' },
    { header: 'LinkedIn', value: 'linkedin_url' },
    { header: 'Role', value: 'current_role' },
    { header: 'Company', value: 'current_company' },
    { header: 'Location', value: 'location' },
    { header: 'Summary', value: 'summary' },
    { header: 'Tags', value: 'tag_names' },
    { header: 'Email verified', value: (r) => (r.email_verified_at ? 'yes' : 'no') },
    { header: 'Registered', value: 'created_at' },
  ];
  const csv = toCsv(detailed, columns);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="candidates.csv"');
  res.send(csv);
});

export default router;
