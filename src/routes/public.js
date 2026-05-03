import express from 'express';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../services/i18n.js';
import { LOCALE_COOKIE } from '../middleware/i18n.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.render('public/index');
});

router.get('/privacy', (req, res) => {
  res.render(req.locale === 'en' ? 'public/privacy-en' : 'public/privacy-sv');
});

router.get('/healthz', (req, res) => {
  res.type('text/plain').send('ok');
});

router.get('/locale/:lang', (req, res) => {
  const lang = SUPPORTED_LOCALES.includes(req.params.lang)
    ? req.params.lang
    : DEFAULT_LOCALE;

  res.cookie(LOCALE_COOKIE, lang, {
    maxAge: 365 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    httpOnly: false,
  });

  const returnTo =
    typeof req.query.return === 'string' ? req.query.return : '/';
  const safeReturn =
    returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
  res.redirect(safeReturn);
});

export default router;
