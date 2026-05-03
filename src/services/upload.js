import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';
import { generateFilename } from '../lib/tokens.js';

export const ALLOWED_CV_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const ALLOWED_LOGO_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/svg+xml',
]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

ensureDir(config.uploadsDir);
ensureDir(config.brandingDir);

function makeStorage(dir) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, generateFilename(ext));
    },
  });
}

const cvUploader = multer({
  storage: makeStorage(config.uploadsDir),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_CV_MIME.has(file.mimetype)) cb(null, true);
    else cb(null, false);
  },
}).single('cv');

const logoUploader = multer({
  storage: makeStorage(config.brandingDir),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_LOGO_MIME.has(file.mimetype)) cb(null, true);
    else cb(null, false);
  },
}).single('logo');

function wrap(uploader) {
  return (req, res, next) => {
    uploader(req, res, (err) => {
      if (err) req.uploadError = err;
      next();
    });
  };
}

export const cvUpload = wrap(cvUploader);
export const logoUpload = wrap(logoUploader);
