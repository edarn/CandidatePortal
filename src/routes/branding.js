import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';
import db from '../db/connection.js';

const router = express.Router();

const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');

router.get('/logo', (req, res) => {
  const filenameRow = getSetting.get('logo_filename');
  if (!filenameRow) {
    return res.status(404).end();
  }
  const filePath = path.join(config.brandingDir, filenameRow.value);
  if (!fs.existsSync(filePath)) {
    return res.status(404).end();
  }
  const mimeRow = getSetting.get('logo_mime_type');
  res.set('Cache-Control', 'public, max-age=300');
  if (mimeRow?.value) {
    res.type(mimeRow.value);
  }
  fs.createReadStream(filePath).pipe(res);
});

export default router;
