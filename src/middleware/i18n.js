import { SUPPORTED_LOCALES, DEFAULT_LOCALE, tFor } from '../services/i18n.js';

export const LOCALE_COOKIE = 'locale';

export function i18n(req, res, next) {
  let locale;

  const fromCookie = req.cookies?.[LOCALE_COOKIE];
  if (fromCookie && SUPPORTED_LOCALES.includes(fromCookie)) {
    locale = fromCookie;
  } else {
    const accept = req.headers['accept-language'] || '';
    const preferred = accept
      .split(',')
      .map((s) => s.trim().split(';')[0].slice(0, 2).toLowerCase());
    locale = preferred.find((l) => SUPPORTED_LOCALES.includes(l)) || DEFAULT_LOCALE;
  }

  req.locale = locale;
  res.locals.locale = locale;
  res.locals.supportedLocales = SUPPORTED_LOCALES;
  res.locals.t = tFor(locale);
  next();
}
