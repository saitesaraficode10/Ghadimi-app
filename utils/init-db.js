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

CREATE TABLE IF NOT EXISTS property_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL,
  path TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(property_id) REFERENCES properties(id) ON DELETE CASCADE
);
`);

try {
  const cols = db.prepare('PRAGMA table_info(properties)').all().map(c => c.name);
  const add = (n, t) => { if (!cols.includes(n)) db.exec(`ALTER TABLE properties ADD COLUMN ${n} ${t}`); };
  add('map_url', 'TEXT'); add('lat', 'REAL'); add('lng', 'REAL'); add('contact_whatsapp', 'TEXT');
} catch (e) {}

try {
  const rcols = db.prepare('PRAGMA table_info(visit_requests)').all().map(c => c.name);
  if (!rcols.includes('visit_location')) db.exec('ALTER TABLE visit_requests ADD COLUMN visit_location TEXT');
} catch (e) {}

try {
  const ucols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!ucols.includes('user_code')) db.exec('ALTER TABLE users ADD COLUMN user_code INTEGER');
  if (!ucols.includes('last_seen')) db.exec('ALTER TABLE users ADD COLUMN last_seen TEXT');
} catch (e) {}

const set = (k, v) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(k);
  if (!row) db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(k, v);
};
set('contact_whatsapp', '+37400000000');
set('contact_phone', '+37400000000');
set('contact_label', 'پشتیبانی واتساپ');
set('next_user_code', '200');
set('page_views', '1287');
set('unique_visitors', '864');


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

db.exec(`
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_code TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL,
  rent_type TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  amount REAL,
  currency TEXT DEFAULT 'AMD',
  pay_method TEXT NOT NULL,
  pay_status TEXT DEFAULT 'pending',
  status TEXT DEFAULT 'pending',
  admin_note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(property_id) REFERENCES properties(id)
);

CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone TEXT,
  note TEXT,
  used INTEGER DEFAULT 0,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  locked_until TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_am);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_visit_prop ON visit_requests(property_id);
`);

set('pay_card_ir', '');
set('pay_card_ir_enabled', '0');
set('pay_card_am', '');
set('pay_card_am_enabled', '0');
set('pay_card_visa', '');
set('pay_card_visa_enabled', '0');
set('pay_card_note', 'پس از واریز پیش‌پرداخت، رسید را برای پشتیبانی ارسال کنید.');

console.log('Amlak DB extended (bookings, invites, security)');
