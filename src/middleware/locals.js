import db from '../db/connection.js';
import { generateCsrfToken } from './csrf.js';

const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');

export function locals(req, res, next) {
  res.locals.user = req.session?.user || null;

  const logoRow = getSetting.get('logo_filename');
  res.locals.logoFilename = logoRow?.value || null;

  res.locals.csrfToken = generateCsrfToken(req);

  if (req.session?.flash) {
    res.locals.flash = req.session.flash;
    delete req.session.flash;
  } else {
    res.locals.flash = null;
  }

  res.locals.path = req.path;
  res.locals.query = req.query;

  next();
}

export function setFlash(req, type, message) {
  req.session.flash = { type, message };
}
