import express from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import SqliteStoreFactory from 'better-sqlite3-session-store';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './db/connection.js';
import { config } from './config.js';
import { i18n } from './middleware/i18n.js';
import { locals } from './middleware/locals.js';
import publicRoutes from './routes/public.js';
import brandingRoutes from './routes/branding.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SqliteStore = SqliteStoreFactory(session);

export function createApp() {
  const app = express();

  if (config.isProd) {
    app.set('trust proxy', 1);
  }

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", 'https://cdn.jsdelivr.net', "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          scriptSrc: ["'self'"],
          objectSrc: ["'self'"],
          frameSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use(
    express.static(path.join(__dirname, '..', 'public'), {
      maxAge: config.isProd ? '7d' : 0,
    }),
  );

  app.use(
    session({
      store: new SqliteStore({
        client: db,
        expired: { clear: true, intervalMs: 15 * 60 * 1000 },
      }),
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: config.isProd,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
      name: 'cp.sid',
    }),
  );

  app.use(i18n);
  app.use(locals);

  app.use('/', publicRoutes);
  app.use('/', authRoutes);
  app.use('/me', meRoutes);
  app.use('/admin', adminRoutes);
  app.use('/branding', brandingRoutes);

  app.use((req, res) => {
    res.status(404).render('errors/404');
  });

  app.use((err, req, res, _next) => {
    console.error(err);
    if (err.code === 'EBADCSRFTOKEN') {
      res.status(403);
      return res.render('errors/csrf');
    }
    res.status(500).render('errors/500');
  });

  return app;
}
