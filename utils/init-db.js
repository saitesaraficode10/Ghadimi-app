const db = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Yerevan',
  address TEXT,
  rooms INTEGER DEFAULT 1,
  area REAL,
  price_monthly REAL NOT NULL,
  currency TEXT DEFAULT 'AMD',
  description TEXT,
  image_path TEXT,
  map_url TEXT,
  lat REAL,
  lng REAL,
  contact_whatsapp TEXT,
  status TEXT DEFAULT 'available',
  available_from TEXT,
  max_people INTEGER DEFAULT 2,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_code INTEGER UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone_am TEXT UNIQUE NOT NULL,
  whatsapp TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS visit_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_code TEXT UNIQUE NOT NULL,
  user_id INTEGER,
  property_id INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  whatsapp TEXT,
  need_from TEXT NOT NULL,
  rent_duration TEXT NOT NULL,
  people_count INTEGER NOT NULL,
  message TEXT,
  status TEXT DEFAULT 'pending',
  visit_datetime TEXT,
  admin_note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(property_id) REFERENCES properties(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, property_id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(property_id) REFERENCES properties(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

try {
  const cols = db.prepare('PRAGMA table_info(properties)').all().map(c => c.name);
  const add = (n, t) => { if (!cols.includes(n)) db.exec(`ALTER TABLE properties ADD COLUMN ${n} ${t}`); };
  add('map_url', 'TEXT'); add('lat', 'REAL'); add('lng', 'REAL'); add('contact_whatsapp', 'TEXT');
} catch (e) {}

try {
  const ucols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!ucols.includes('user_code')) db.exec('ALTER TABLE users ADD COLUMN user_code INTEGER');
  if (!ucols.includes('phone_am') && ucols.includes('phone')) {
    // keep old phone if exists; new installs use phone_am
  }
} catch (e) {}

const set = (k, v) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(k);
  if (!row) db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(k, v);
};
set('contact_whatsapp', '+37400000000');
set('contact_phone', '+37400000000');
set('contact_label', 'پشتیبانی واتساپ');
set('next_user_code', '200');

const c = db.prepare('SELECT COUNT(*) AS c FROM properties').get().c;
if (c === 0) {
  const ins = db.prepare(`
    INSERT INTO properties (code, title, city, address, rooms, area, price_monthly, currency, description, status, available_from, max_people, map_url, contact_whatsapp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  ins.run('A-101', 'آپارتمان ۱ خواب مرکز ایروان', 'Yerevan', 'Kentron', 1, 45, 350000, 'AMD', 'نزدیک مرکز، مبله، اینترنت', 'available', null, 2, 'https://maps.google.com/?q=Kentron+Yerevan', '+37400000000');
  ins.run('A-102', 'سوئیت نزدیک مترو', 'Yerevan', 'Arabkir', 1, 30, 280000, 'AMD', 'آرام و تمیز', 'rented', '2026-10-15', 2, 'https://maps.google.com/?q=Arabkir+Yerevan', '+37400000000');
  ins.run('B-201', 'آپارتمان ۲ خواب خانواده', 'Yerevan', 'Ajapnyak', 2, 70, 450000, 'AMD', 'مناسب خانواده', 'available', null, 4, 'https://maps.google.com/?q=Ajapnyak+Yerevan', '+37400000000');
}

console.log('Amlak DB initialized');
