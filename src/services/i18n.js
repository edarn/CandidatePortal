import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '..', '..', 'locales');

export const SUPPORTED_LOCALES = ['sv', 'en'];
export const DEFAULT_LOCALE = 'sv';

const translations = {};

for (const locale of SUPPORTED_LOCALES) {
  const file = path.join(localesDir, `${locale}.json`);
  translations[locale] = JSON.parse(fs.readFileSync(file, 'utf8'));
}

function lookup(obj, key) {
  return key
    .split('.')
    .reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

export function translate(locale, key, vars = {}) {
  const dict = translations[locale] || translations[DEFAULT_LOCALE];
  let value = lookup(dict, key);
  if (value === undefined) {
    value = lookup(translations[DEFAULT_LOCALE], key);
  }
  if (typeof value !== 'string') {
    return key;
  }
  return value.replace(/\{(\w+)\}/g, (_, name) =>
    vars[name] !== undefined ? String(vars[name]) : `{${name}}`,
  );
}

export function tFor(locale) {
  const safe = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  return (key, vars) => translate(safe, key, vars);
}
