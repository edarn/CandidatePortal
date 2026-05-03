import crypto from 'node:crypto';

export function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function generateFilename(extension = '') {
  const ext = extension.startsWith('.') ? extension : extension ? `.${extension}` : '';
  return `${crypto.randomUUID()}${ext}`;
}
