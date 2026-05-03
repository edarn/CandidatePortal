import bcrypt from 'bcrypt';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import db from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { config } from '../src/config.js';
import { generateFilename } from '../src/lib/tokens.js';

const DEMO_PASSWORD = 'demo-password-12345';

const candidates = [
  {
    full_name: 'Anna Andersson',
    email: 'anna.andersson@example.com',
    phone: '+46701112233',
    linkedin: 'https://linkedin.com/in/anna-andersson',
    role: 'Senior Backend Developer',
    company: 'Spotify',
    location: 'Stockholm',
    summary: 'Backend-utvecklare med 8 års erfarenhet av Java och Kotlin. Driven av att bygga skalbara mikroservices.',
  },
  {
    full_name: 'Erik Eriksson',
    email: 'erik.eriksson@example.com',
    phone: '+46702223344',
    linkedin: 'https://linkedin.com/in/erik-eriksson',
    role: 'Frontend Engineer',
    company: 'Klarna',
    location: 'Stockholm',
    summary: 'React och TypeScript-specialist. Gillar att bygga responsiva och tillgängliga gränssnitt.',
  },
  {
    full_name: 'Sara Svensson',
    email: 'sara.svensson@example.com',
    phone: '+46703334455',
    linkedin: 'https://linkedin.com/in/sara-svensson',
    role: 'UX Designer',
    company: 'King',
    location: 'Stockholm',
    summary: 'UX-designer med passion för användarcentrerad design. Erfarenhet från fintech och spel.',
  },
  {
    full_name: 'Johan Johansson',
    email: 'johan.johansson@example.com',
    phone: '+46704445566',
    linkedin: 'https://linkedin.com/in/johan-johansson',
    role: 'Product Manager',
    company: 'Tink',
    location: 'Stockholm',
    summary: 'PM som översätter mellan produkt, design och teknik. 6 års erfarenhet i fintech.',
  },
  {
    full_name: 'Maria Lindberg',
    email: 'maria.lindberg@example.com',
    phone: '+46705556677',
    linkedin: 'https://linkedin.com/in/maria-lindberg',
    role: 'Data Scientist',
    company: 'Volvo Cars',
    location: 'Göteborg',
    summary: 'PhD i maskininlärning. Bygger modeller för autonom körning.',
  },
  {
    full_name: 'Karl Karlsson',
    email: 'karl.karlsson@example.com',
    phone: '+46706667788',
    linkedin: 'https://linkedin.com/in/karl-karlsson',
    role: 'DevOps Engineer',
    company: 'Truecaller',
    location: 'Stockholm',
    summary: 'Infrastruktur som kod, Kubernetes, GCP. Älskar att eliminera toil.',
  },
  {
    full_name: 'Elin Nilsson',
    email: 'elin.nilsson@example.com',
    phone: '+46707778899',
    linkedin: 'https://linkedin.com/in/elin-nilsson',
    role: 'Full Stack Developer',
    company: 'Mojang',
    location: 'Stockholm',
    summary: 'JS, Go, Python. Söker nästa utmaning inom spel eller fintech.',
  },
  {
    full_name: 'Oskar Olsson',
    email: 'oskar.olsson@example.com',
    phone: '+46708889900',
    linkedin: 'https://linkedin.com/in/oskar-olsson',
    role: 'iOS Engineer',
    company: 'iZettle',
    location: 'Stockholm',
    summary: 'Native iOS-utveckling, Swift, SwiftUI. 5+ år.',
  },
  {
    full_name: 'Linnea Lindqvist',
    email: 'linnea.lindqvist@example.com',
    phone: '+46709990011',
    linkedin: 'https://linkedin.com/in/linnea-lindqvist',
    role: 'Engineering Manager',
    company: 'Voi',
    location: 'Stockholm',
    summary: 'EM med teknisk bakgrund i backend. Brinner för att coacha team.',
  },
  {
    full_name: 'Niklas Berg',
    email: 'niklas.berg@example.com',
    phone: '+46707112233',
    linkedin: 'https://linkedin.com/in/niklas-berg',
    role: 'Security Engineer',
    company: 'Mullvad VPN',
    location: 'Göteborg',
    summary: 'Application security, threat modeling, code review. CTF-spelare på fritiden.',
  },
];

const tagsToCreate = [
  { name: 'backend', color: '#3b82f6' },
  { name: 'frontend', color: '#10b981' },
  { name: 'design', color: '#f59e0b' },
  { name: 'pm', color: '#8b5cf6' },
  { name: 'senior', color: '#ef4444' },
  { name: 'konferens-2026', color: '#06b6d4' },
];

const tagAssignments = {
  'anna.andersson@example.com': ['backend', 'senior', 'konferens-2026'],
  'erik.eriksson@example.com': ['frontend', 'senior'],
  'sara.svensson@example.com': ['design'],
  'johan.johansson@example.com': ['pm', 'senior', 'konferens-2026'],
  'maria.lindberg@example.com': ['backend', 'senior'],
  'karl.karlsson@example.com': ['backend'],
  'elin.nilsson@example.com': ['backend', 'frontend'],
  'oskar.olsson@example.com': ['frontend'],
  'linnea.lindqvist@example.com': ['pm', 'senior'],
  'niklas.berg@example.com': ['backend', 'senior'],
};

const noteAssignments = {
  'anna.andersson@example.com': [
    {
      text: 'Träffade på Devoxx-konferensen. Mycket intresserad av nya roller inom plattform/infra.',
      location: 'Stockholm',
      date: '2026-04-15',
    },
  ],
  'sara.svensson@example.com': [
    { text: 'Stark portfolio. Söker mer ledarskap.', location: null, date: null },
  ],
  'johan.johansson@example.com': [
    {
      text: 'Diskuterade möjlighet inom B2B-fintech. Återkomma efter sommaren.',
      location: 'Slussen, Stockholm',
      date: '2026-04-22',
    },
  ],
};

const cvFor = [
  'anna.andersson@example.com',
  'erik.eriksson@example.com',
  'maria.lindberg@example.com',
  'karl.karlsson@example.com',
  'linnea.lindqvist@example.com',
];

function buildMinimalPdf(name) {
  // minimal valid PDF with the candidate's name as content
  const text = `CV — ${name}`;
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    'xref',
    '0 6',
    '0000000000 65535 f',
    '0000000009 00000 n',
    '0000000058 00000 n',
    '0000000107 00000 n',
    '0000000220 00000 n',
    '0000000300 00000 n',
    'trailer << /Size 6 /Root 1 0 R >>',
    'startxref',
    '400',
    '%%EOF',
  ];
  return objects.join('\n');
}

const MARKER_KEY = 'demo_seed_done';

const setMarker = () =>
  db
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('${MARKER_KEY}', datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    )
    .run();

export async function seedDemo({ force = false } = {}) {
  // 1. If real candidates already exist, never pollute — just mark as done.
  const candidatesExist = db.prepare('SELECT 1 FROM candidates LIMIT 1').get();
  if (candidatesExist) {
    setMarker();
    if (force) {
      console.log('Demo seed: candidates exist, refusing to seed even with --force.');
    }
    return;
  }

  // 2. If marker is set and we're not forcing, skip.
  if (!force) {
    const marker = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(MARKER_KEY);
    if (marker) {
      // Already seeded once; skip silently on every subsequent boot.
      return;
    }
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  fs.mkdirSync(config.uploadsDir, { recursive: true });

  // Tags
  const tagIds = {};
  for (const tag of tagsToCreate) {
    const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(tag.name);
    if (existing) {
      tagIds[tag.name] = existing.id;
    } else {
      const result = db
        .prepare('INSERT INTO tags (name, color) VALUES (?, ?) RETURNING id')
        .get(tag.name, tag.color);
      tagIds[tag.name] = result.id;
    }
  }

  const insertUser = db.prepare(
    "INSERT INTO users (email, password_hash, role, email_verified_at) VALUES (?, ?, 'candidate', datetime('now')) RETURNING id",
  );
  const insertCandidate = db.prepare(`
    INSERT INTO candidates
      (user_id, full_name, phone, linkedin_url, current_role, current_company, location, summary, preferred_locale, consent_given_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sv', datetime('now'))
  `);
  const updateCv = db.prepare(`
    UPDATE candidates SET cv_filename = ?, cv_original_name = ?, cv_mime_type = ?, cv_uploaded_at = datetime('now')
    WHERE user_id = ?
  `);
  const insertNote = db.prepare(`
    INSERT INTO admin_notes (candidate_user_id, note_text, met_at_location, met_at_date)
    VALUES (?, ?, ?, ?)
  `);
  const linkTag = db.prepare(
    'INSERT OR IGNORE INTO candidate_tags (candidate_user_id, tag_id) VALUES (?, ?)',
  );

  for (const c of candidates) {
    const { id: userId } = insertUser.get(c.email, passwordHash);
    insertCandidate.run(
      userId,
      c.full_name,
      c.phone,
      c.linkedin,
      c.role,
      c.company,
      c.location,
      c.summary,
    );

    if (cvFor.includes(c.email)) {
      const filename = generateFilename('.pdf');
      fs.writeFileSync(
        path.join(config.uploadsDir, filename),
        buildMinimalPdf(c.full_name),
      );
      updateCv.run(
        filename,
        `${c.full_name.replace(/ /g, '_')}_CV.pdf`,
        'application/pdf',
        userId,
      );
    }

    for (const tagName of tagAssignments[c.email] || []) {
      linkTag.run(userId, tagIds[tagName]);
    }

    for (const note of noteAssignments[c.email] || []) {
      insertNote.run(userId, note.text, note.location, note.date);
    }
  }

  setMarker();

  console.log(
    `Seeded ${candidates.length} demo candidates. Login as any of them with password: "${DEMO_PASSWORD}"`,
  );
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runMigrations();
  const force = process.argv.includes('--force');
  await seedDemo({ force });
}
