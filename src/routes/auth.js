import express from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import db from '../db/connection.js';
import { csrfProtection } from '../middleware/csrf.js';
import {
  emailSchema,
  passwordSchema,
  phoneSchema,
  fullNameSchema,
  flattenZodErrors,
} from '../lib/validation.js';
import { generateToken } from '../lib/tokens.js';
import { sendMail } from '../services/email.js';
import { setFlash } from '../middleware/locals.js';
import { config } from '../config.js';

const router = express.Router();
const BCRYPT_COST = 12;

// --- prepared statements ---
const findUserByEmail = db.prepare(
  'SELECT id, email, password_hash, role, email_verified_at FROM users WHERE email = ?',
);
const insertUser = db.prepare(
  'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) RETURNING id',
);
const insertCandidate = db.prepare(`
  INSERT INTO candidates (user_id, full_name, phone, preferred_locale, consent_given_at)
  VALUES (?, ?, ?, ?, datetime('now'))
`);
const updateEmailVerified = db.prepare(
  "UPDATE users SET email_verified_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
);
const updatePassword = db.prepare(
  "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
);

const insertEmailVerification = db.prepare(
  "INSERT INTO email_verifications (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+24 hours'))",
);
const findEmailVerification = db.prepare(
  "SELECT user_id FROM email_verifications WHERE token = ? AND expires_at > datetime('now')",
);
const deleteEmailVerifications = db.prepare(
  'DELETE FROM email_verifications WHERE user_id = ?',
);

const insertPasswordReset = db.prepare(
  "INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))",
);
const findPasswordReset = db.prepare(
  "SELECT user_id FROM password_resets WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')",
);
const markPasswordResetUsed = db.prepare(
  "UPDATE password_resets SET used_at = datetime('now') WHERE token = ?",
);

// --- rate limiters ---
const rateLimitHandler = (redirectTo) => (req, res) => {
  setFlash(req, 'error', res.locals.t('errors.rateLimited'));
  res.redirect(redirectTo);
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rateLimitHandler('/login'),
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rateLimitHandler('/register'),
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rateLimitHandler('/forgot-password'),
});

// --- schemas ---
const consentTrue = z
  .union([z.literal('on'), z.literal('true')], { params: { i18n: 'errors.consentRequired' } })
  .transform(() => true);

const registerSchema = z.object({
  full_name: fullNameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  consent: consentTrue,
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

const forgotSchema = z.object({
  email: emailSchema,
});

const resetSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

// --- routes ---

router.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/me');
  }
  res.render('auth/register', { values: {}, errors: {} });
});

router.post('/register', csrfProtection, registerLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).render('auth/register', {
      values: req.body,
      errors: flattenZodErrors(parsed.error),
    });
  }
  const { full_name, email, phone, password } = parsed.data;

  if (findUserByEmail.get(email)) {
    return res.status(400).render('auth/register', {
      values: req.body,
      errors: { email: 'errors.emailTaken' },
    });
  }

  const hash = await bcrypt.hash(password, BCRYPT_COST);
  const token = generateToken();

  const insertAll = db.transaction((data) => {
    const { id } = insertUser.get(data.email, data.hash, 'candidate');
    insertCandidate.run(id, data.full_name, data.phone, data.locale);
    insertEmailVerification.run(data.token, id);
    return id;
  });

  insertAll({ email, hash, full_name, phone, locale: req.locale, token });

  const verifyUrl = `${config.baseUrl}/verify-email?token=${encodeURIComponent(token)}`;

  try {
    await sendMail({
      to: email,
      locale: req.locale,
      template: 'verify-email',
      vars: { name: full_name, verifyUrl },
    });
  } catch (err) {
    console.error('Failed to send verification email:', err);
  }

  if (!config.smtp.ready && !config.isProd) {
    console.log(`[dev] Verification URL for ${email}: ${verifyUrl}`);
  }

  return res.render('auth/verify-pending', { email });
});

router.get('/verify-email', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) return res.status(400).render('auth/verify-expired');
  const row = findEmailVerification.get(token);
  if (!row) return res.status(400).render('auth/verify-expired');

  const tx = db.transaction((userId) => {
    updateEmailVerified.run(userId);
    deleteEmailVerifications.run(userId);
  });
  tx(row.user_id);
  return res.render('auth/verify-success');
});

router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/me');
  }
  res.render('auth/login', { values: {}, errors: {} });
});

router.post('/login', csrfProtection, loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).render('auth/login', {
      values: req.body,
      errors: flattenZodErrors(parsed.error),
    });
  }
  const { email, password } = parsed.data;
  const user = findUserByEmail.get(email);

  const renderInvalid = () =>
    res.status(401).render('auth/login', {
      values: { email },
      errors: { _form: 'errors.invalidCredentials' },
    });

  if (!user || user.role !== 'candidate') {
    if (user) {
      // constant-time delay
      await bcrypt.compare(password, user.password_hash);
    }
    return renderInvalid();
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return renderInvalid();

  if (!user.email_verified_at) {
    return res.status(403).render('auth/login', {
      values: { email },
      errors: { _form: 'errors.notVerified' },
    });
  }

  const returnTo = req.session.returnTo;
  req.session.regenerate((err) => {
    if (err) return res.status(500).render('errors/500');
    req.session.user = { id: user.id, email: user.email, role: user.role };
    req.session.save((err2) => {
      if (err2) return res.status(500).render('errors/500');
      const target =
        returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/me';
      res.redirect(target);
    });
  });
});

router.post('/logout', csrfProtection, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('cp.sid');
    res.redirect('/');
  });
});

router.get('/forgot-password', (req, res) => {
  res.render('auth/forgot-password', { values: {}, errors: {}, sent: false });
});

router.post('/forgot-password', csrfProtection, forgotLimiter, async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).render('auth/forgot-password', {
      values: req.body,
      errors: flattenZodErrors(parsed.error),
      sent: false,
    });
  }
  const { email } = parsed.data;
  const user = findUserByEmail.get(email);

  const finish = () =>
    res.render('auth/forgot-password', { values: {}, errors: {}, sent: true });

  if (!user || user.role !== 'candidate') return finish();

  const token = generateToken();
  insertPasswordReset.run(token, user.id);
  const resetUrl = `${config.baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

  try {
    await sendMail({
      to: email,
      locale: req.locale,
      template: 'reset-password',
      vars: { resetUrl },
    });
  } catch (err) {
    console.error('Failed to send reset email:', err);
  }
  if (!config.smtp.ready && !config.isProd) {
    console.log(`[dev] Reset URL for ${email}: ${resetUrl}`);
  }
  return finish();
});

router.get('/reset-password', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) return res.render('auth/reset-expired');
  const row = findPasswordReset.get(token);
  if (!row) return res.render('auth/reset-expired');
  res.render('auth/reset-password', { token, errors: {} });
});

router.post('/reset-password', csrfProtection, async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).render('auth/reset-password', {
      token: req.body?.token || '',
      errors: flattenZodErrors(parsed.error),
    });
  }
  const { token, password } = parsed.data;
  const row = findPasswordReset.get(token);
  if (!row) return res.render('auth/reset-expired');

  const hash = await bcrypt.hash(password, BCRYPT_COST);
  const tx = db.transaction(() => {
    updatePassword.run(hash, row.user_id);
    markPasswordResetUsed.run(token);
  });
  tx();
  setFlash(req, 'success', res.locals.t('auth.reset.success'));
  res.redirect('/login');
});

export default router;
