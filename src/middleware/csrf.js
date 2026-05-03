import { csrfSync } from 'csrf-sync';

const sync = csrfSync({
  getTokenFromRequest: (req) => {
    return req.body?._csrf || req.headers['x-csrf-token'];
  },
});

export const csrfProtection = sync.csrfSynchronisedProtection;
export const generateCsrfToken = sync.generateToken;
