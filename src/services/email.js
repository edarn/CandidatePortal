import { Resend } from 'resend';
import ejs from 'ejs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { tFor } from './i18n.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const emailsDir = path.join(__dirname, '..', 'views', 'emails');

let client = null;

function getClient() {
  if (!config.email.ready) return null;
  if (!client) client = new Resend(config.email.apiKey);
  return client;
}

export async function sendMail({ to, locale = 'sv', template, vars = {} }) {
  const t = tFor(locale);
  const subject = t(`emails.${template}.subject`);
  const siteName = t('site.title');

  const templatePath = path.join(emailsDir, `${template}.ejs`);
  const html = await ejs.renderFile(templatePath, {
    ...vars,
    t,
    locale,
    baseUrl: config.baseUrl,
    siteName,
  });

  const c = getClient();
  if (!c) {
    if (!config.isProd) {
      console.log(`[email:dev] to=${to} template=${template} subject="${subject}"`);
      console.log(`[email:dev] vars=${JSON.stringify(vars)}`);
      return { devMode: true };
    }
    throw new Error('Email not configured (RESEND_API_KEY missing)');
  }

  const { data, error } = await c.emails.send({
    from: config.email.from,
    to,
    subject,
    html,
  });

  if (error) {
    const msg = error.message || error.name || JSON.stringify(error);
    throw new Error(`Resend error: ${msg}`);
  }
  return data;
}

export async function verifyEmailTransport() {
  if (!config.email.ready) {
    return { ok: false, reason: 'RESEND_API_KEY not configured' };
  }
  return { ok: true };
}
