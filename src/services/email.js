import nodemailer from 'nodemailer';
import ejs from 'ejs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { tFor } from './i18n.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const emailsDir = path.join(__dirname, '..', 'views', 'emails');

let transporter = null;

function getTransporter() {
  if (!config.smtp.ready) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
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

  const tx = getTransporter();
  if (!tx) {
    if (!config.isProd) {
      console.log(`[email:dev] to=${to} template=${template} subject="${subject}"`);
      console.log(`[email:dev] vars=${JSON.stringify(vars)}`);
      return { devMode: true };
    }
    throw new Error('SMTP not configured');
  }

  return tx.sendMail({
    from: config.smtp.from,
    to,
    subject,
    html,
  });
}

export async function verifyEmailTransport() {
  const tx = getTransporter();
  if (!tx) return { ok: false, reason: 'not configured' };
  try {
    await tx.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}
