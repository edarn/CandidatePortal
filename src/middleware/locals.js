import db from '../db/connection.js';
import { generateCsrfToken } from './csrf.js';

const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');

function hashHue(input) {
  const s = String(input || '');
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

export function avatarColor(name) {
  return `hsl(${hashHue(name)}, 60%, 50%)`;
}

export function avatarGradient(name) {
  const h1 = hashHue(name);
  const h2 = (h1 + 30) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 65%, 50%) 0%, hsl(${h2}, 70%, 55%) 100%)`;
}

export function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function locals(req, res, next) {
  res.locals.user = req.session?.user || null;
  res.locals.avatarColor = avatarColor;
  res.locals.avatarGradient = avatarGradient;
  res.locals.initials = initials;

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
