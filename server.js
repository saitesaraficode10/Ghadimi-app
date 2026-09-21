require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./utils/db');
const { authUser, authAdmin, optionalUser, JWT_SECRET } = require('./middleware/auth');
const { csrfToken, verifyCsrf, sanitizeText, isValidPhone } = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);

const uploadDir = path.join(__dirname, 'public', 'uploads', 'properties');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      "font-src": ["'self'", "https://cdn.jsdelivr.net", "data:"],
      "img-src": ["'self'", "data:", "blob:", "https:"],
      "frame-src": ["'self'", "https://maps.google.com", "https://www.google.com"],
      "connect-src": ["'self'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"]
    }
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', dotfiles: 'deny' }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
app.use(csrfToken);
app.use(verifyCsrf);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|webp/i.test(file.mimetype) && /\.(jpe?g|png|webp)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only image uploads allowed'), ok);
  }
});


function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  const row = db.prepare('SELECT key FROM settings WHERE key = ?').get(key);
  if (row) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(value), key);
  else db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}
function nextUserCode() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'next_user_code'").get();
  let n = row ? parseInt(row.value, 10) : 200;
  if (!Number.isFinite(n) || n < 200) n = 200;
  // ensure unique
  while (db.prepare('SELECT id FROM users WHERE user_code = ?').get(n)) n += 1;
  setSetting('next_user_code', String(n + 1));
  return n;
}

const translations = {
  fa: require('./locales/fa.json'),
  en: require('./locales/en.json'),
  ru: require('./locales/ru.json'),
  hy: require('./locales/hy.json')
};

function t(lang, key) {
  return (translations[lang] && translations[lang][key]) || translations.fa[key] || key;
}

function statusLabel(lang, s) {
  const map = { available: 'available', rented: 'rented', reserved: 'reserved' };
  return t(lang, map[s] || s);
}

app.use((req, res, next) => {
  const lang = ['fa', 'en', 'ru', 'hy'].includes(req.cookies.lang) ? req.cookies.lang : 'fa';
  res.locals.lang = lang;
  res.locals.t = (key) => t(lang, key);
  res.locals.dir = lang === 'fa' || lang === 'hy' ? 'rtl' : 'ltr';
  res.locals.statusLabel = (s) => statusLabel(lang, s);
  next();
});

app.get('/set-lang/:lang', (req, res) => {
  const lang = ['fa', 'en', 'ru', 'hy'].includes(req.params.lang) ? req.params.lang : 'fa';
  res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000 });
  res.redirect(req.get('Referer') || '/');
});

// ---- Public listings with full filters ----
app.get('/', optionalUser, (req, res) => {
  const { city = '', status = '', rooms = '', price_from = '', price_to = '', area_from = '' } = req.query;
  let sql = 'SELECT * FROM properties WHERE 1=1';
  const params = [];
  if (city) { sql += ' AND city LIKE ?'; params.push('%' + city + '%'); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (rooms) { sql += ' AND rooms >= ?'; params.push(parseInt(rooms, 10)); }
  if (price_from) { sql += ' AND price_monthly >= ?'; params.push(parseFloat(price_from)); }
  if (price_to) { sql += ' AND price_monthly <= ?'; params.push(parseFloat(price_to)); }
  if (area_from) { sql += ' AND area >= ?'; params.push(parseFloat(area_from)); }
  sql += ' ORDER BY created_at DESC';
  const properties = db.prepare(sql).all(...params);

  let favIds = new Set();
  if (req.user) {
    favIds = new Set(db.prepare('SELECT property_id FROM favorites WHERE user_id = ?').all(req.user.id).map(r => r.property_id));
  }

  res.render('index', {
    user: req.user, properties, favIds,
    filters: { city, status, rooms, price_from, price_to, area_from },
    title: t(res.locals.lang, 'home')
  });
});

app.get('/property/:code', optionalUser, (req, res) => {
  const property = db.prepare('SELECT * FROM properties WHERE code = ?').get(req.params.code);
  if (!property) return res.status(404).send('Not found');
  let isFav = false;
  if (req.user) {
    isFav = !!db.prepare('SELECT id FROM favorites WHERE user_id = ? AND property_id = ?').get(req.user.id, property.id);
  }
  res.render('property', { user: req.user, property, isFav, error: null, title: property.title });
});

app.post('/property/:code/visit', optionalUser, (req, res) => {
  const property = db.prepare('SELECT * FROM properties WHERE code = ?').get(req.params.code);
  if (!property) return res.status(404).send('Not found');
  const full_name = sanitizeText(req.body.full_name, 80);
  const phone = sanitizeText(req.body.phone, 20);
  const whatsapp = sanitizeText(req.body.whatsapp, 20);
  const need_from = sanitizeText(req.body.need_from, 20);
  const rent_duration = sanitizeText(req.body.rent_duration, 40);
  const people_count = parseInt(req.body.people_count, 10);
  const message = sanitizeText(req.body.message, 1000);
  if (!full_name || !phone || !need_from || !rent_duration || !people_count || people_count < 1 || people_count > 20 || !isValidPhone(phone)) {
    let isFav = false;
    if (req.user) isFav = !!db.prepare('SELECT id FROM favorites WHERE user_id = ? AND property_id = ?').get(req.user.id, property.id);
    return res.render('property', { user: req.user, property, isFav, error: 'لطفاً فیلدهای ضروری را درست پر کنید', title: property.title });
  }
  const request_code = 'V' + Date.now().toString().slice(-10);
  db.prepare(`
    INSERT INTO visit_requests
    (request_code, user_id, property_id, full_name, phone, whatsapp, need_from, rent_duration, people_count, message, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(request_code, req.user ? req.user.id : null, property.id, full_name, phone, whatsapp || null, need_from, rent_duration, people_count, message || null);
  res.render('request-success', { user: req.user, request_code, title: 'OK' });
});

app.post('/favorites/:code/toggle', authUser, (req, res) => {
  const property = db.prepare('SELECT * FROM properties WHERE code = ?').get(req.params.code);
  if (!property) return res.redirect('/');
  const existing = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND property_id = ?').get(req.user.id, property.id);
  if (existing) db.prepare('DELETE FROM favorites WHERE id = ?').run(existing.id);
  else db.prepare('INSERT INTO favorites (user_id, property_id) VALUES (?, ?)').run(req.user.id, property.id);
  res.redirect(req.get('Referer') || '/property/' + property.code);
});

app.get('/favorites', authUser, (req, res) => {
  const properties = db.prepare(`
    SELECT p.* FROM properties p
    JOIN favorites f ON f.property_id = p.id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `).all(req.user.id);
  res.render('favorites', { user: req.user, properties, title: t(res.locals.lang, 'favorites') });
});

// auth
app.get('/register', (req, res) => res.render('register', { error: null, title: t(res.locals.lang, 'register') }));
app.post('/register', authLimiter, async (req, res) => {
  const full_name = sanitizeText(req.body.full_name, 80);
  const phone_am = sanitizeText(req.body.phone_am, 20);
  const whatsapp = sanitizeText(req.body.whatsapp, 20);
  const password = String(req.body.password || '');
  if (!full_name || !phone_am || !whatsapp || password.length < 6) {
    return res.render('register', { error: 'نام، شماره ارمنی، واتساپ و رمز (حداقل ۶) الزامی است', title: 'ثبت‌نام' });
  }
  if (!isValidPhone(phone_am) || !isValidPhone(whatsapp)) {
    return res.render('register', { error: 'فرمت شماره تماس یا واتساپ نامعتبر است', title: 'ثبت‌نام' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const user_code = nextUserCode();
    db.prepare('INSERT INTO users (user_code, full_name, phone_am, whatsapp, password_hash) VALUES (?, ?, ?, ?, ?)')
      .run(user_code, full_name, phone_am, whatsapp, hash);
    res.render('register-success', { user: null, user_code, title: 'ثبت‌نام موفق' });
  } catch (e) {
    console.error(e.message);
    res.render('register', { error: 'این شماره قبلاً ثبت شده یا خطا در ثبت', title: 'ثبت‌نام' });
  }
});

app.get('/login', (req, res) => res.render('login', { error: null, title: t(res.locals.lang, 'login') }));
app.post('/login', authLimiter, async (req, res) => {
  const phone = sanitizeText(req.body.phone, 20);
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE phone_am = ?').get(phone);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.render('login', { error: 'شماره یا رمز اشتباه', title: 'ورود' });
  }
  const token = jwt.sign({ id: user.id, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.redirect('/');
});

app.get('/logout', (req, res) => { res.clearCookie('token'); res.redirect('/'); });

app.get('/my-requests', authUser, (req, res) => {
  const requests = db.prepare(`
    SELECT r.*, p.title, p.code AS property_code
    FROM visit_requests r JOIN properties p ON p.id = r.property_id
    WHERE r.user_id = ? OR r.phone = ?
    ORDER BY r.created_at DESC
  `).all(req.user.id, req.user.phone_am || req.user.phone);
  res.render('my-requests', { user: req.user, requests, title: t(res.locals.lang, 'my_requests') });
});

// admin
app.get('/admin/login', (req, res) => res.render('admin/login', { error: null, title: 'Admin' }));
app.post('/admin/login', authLimiter, (req, res) => {
  const { username, password } = req.body;
  const ok =
    (username === process.env.ADMIN1_USERNAME && password === process.env.ADMIN1_PASSWORD) ||
    (username === process.env.ADMIN2_USERNAME && password === process.env.ADMIN2_PASSWORD);
  if (!ok) return res.render('admin/login', { error: 'نام کاربری یا رمز اشتباه', title: 'Admin' });
  const token = jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
  res.cookie('admin_token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 12 * 60 * 60 * 1000 });
  res.redirect('/admin');
});
app.get('/admin/logout', (req, res) => { res.clearCookie('admin_token'); res.redirect('/admin/login'); });

app.get('/admin', authAdmin, (req, res) => {
  const stats = {
    properties: db.prepare('SELECT COUNT(*) AS c FROM properties').get().c,
    available: db.prepare("SELECT COUNT(*) AS c FROM properties WHERE status='available'").get().c,
    pending: db.prepare("SELECT COUNT(*) AS c FROM visit_requests WHERE status='pending'").get().c
  };
  const recent = db.prepare(`
    SELECT r.*, p.title FROM visit_requests r JOIN properties p ON p.id = r.property_id
    ORDER BY r.created_at DESC LIMIT 10
  `).all();
  res.render('admin/dashboard', { admin: req.admin, stats, recent, title: 'Admin' });
});

app.get('/admin/properties', authAdmin, (req, res) => {
  const properties = db.prepare('SELECT * FROM properties ORDER BY created_at DESC').all();
  res.render('admin/properties', { admin: req.admin, properties, title: 'Properties' });
});

app.get('/admin/properties/new', authAdmin, (req, res) => {
  res.render('admin/property-form', { admin: req.admin, property: null, error: null, title: 'New' });
});

app.post('/admin/properties/new', authAdmin, upload.single('image'), (req, res) => {
  const b = req.body;
  const code = sanitizeText(b.code, 30);
  if (!code || !b.title || !b.price_monthly) {
    return res.render('admin/property-form', { admin: req.admin, property: null, error: 'کد ملک، عنوان و قیمت الزامی است', title: 'New' });
  }
  const image_path = req.file ? '/uploads/properties/' + req.file.filename : null;
  try {
  db.prepare(`
    INSERT INTO properties (code, title, city, address, rooms, area, price_monthly, currency, description, image_path, map_url, lat, lng, contact_whatsapp, status, available_from, max_people)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    code, b.title, b.city || 'Yerevan', b.address || null,
    parseInt(b.rooms || '1', 10), b.area ? parseFloat(b.area) : null,
    parseFloat(b.price_monthly), b.currency || 'AMD', b.description || null, image_path,
    b.map_url || null, b.lat ? parseFloat(b.lat) : null, b.lng ? parseFloat(b.lng) : null,
    b.contact_whatsapp || null, b.status || 'available', b.available_from || null,
    parseInt(b.max_people || '2', 10)
  );
  res.redirect('/admin/properties');
  } catch (e) {
    return res.render('admin/property-form', { admin: req.admin, property: null, error: 'کد ملک تکراری است یا خطا در ذخیره', title: 'New' });
  }
});

app.get('/admin/properties/:id/edit', authAdmin, (req, res) => {
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!property) return res.redirect('/admin/properties');
  res.render('admin/property-form', { admin: req.admin, property, error: null, title: 'Edit' });
});

app.post('/admin/properties/:id/edit', authAdmin, upload.single('image'), (req, res) => {
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!property) return res.redirect('/admin/properties');
  const b = req.body;
  let image_path = property.image_path;
  if (req.file) image_path = '/uploads/properties/' + req.file.filename;
  db.prepare(`
    UPDATE properties SET title=?, city=?, address=?, rooms=?, area=?, price_monthly=?, currency=?, description=?,
      image_path=?, map_url=?, lat=?, lng=?, contact_whatsapp=?, status=?, available_from=?, max_people=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    b.title, b.city, b.address, parseInt(b.rooms || '1', 10), b.area ? parseFloat(b.area) : null,
    parseFloat(b.price_monthly), b.currency || 'AMD', b.description, image_path,
    b.map_url || null, b.lat ? parseFloat(b.lat) : null, b.lng ? parseFloat(b.lng) : null,
    b.contact_whatsapp || null, b.status, b.available_from || null, parseInt(b.max_people || '2', 10), property.id
  );
  res.redirect('/admin/properties');
});

app.post('/admin/properties/:id/delete', authAdmin, (req, res) => {
  db.prepare('DELETE FROM favorites WHERE property_id = ?').run(req.params.id);
  db.prepare('DELETE FROM properties WHERE id = ?').run(req.params.id);
  res.redirect('/admin/properties');
});

app.get('/admin/requests', authAdmin, (req, res) => {
  const status = req.query.status || '';
  let requests;
  if (status) {
    requests = db.prepare(`
      SELECT r.*, p.title, p.code AS property_code FROM visit_requests r
      JOIN properties p ON p.id = r.property_id WHERE r.status = ? ORDER BY r.created_at DESC
    `).all(status);
  } else {
    requests = db.prepare(`
      SELECT r.*, p.title, p.code AS property_code FROM visit_requests r
      JOIN properties p ON p.id = r.property_id ORDER BY r.created_at DESC
    `).all();
  }
  res.render('admin/requests', { admin: req.admin, requests, status, title: 'Requests' });
});

app.get('/admin/requests/:id', authAdmin, (req, res) => {
  const request = db.prepare(`
    SELECT r.*, p.title, p.code AS property_code, p.address FROM visit_requests r
    JOIN properties p ON p.id = r.property_id WHERE r.id = ?
  `).get(req.params.id);
  if (!request) return res.redirect('/admin/requests');
  res.render('admin/request-detail', { admin: req.admin, request, title: 'Request' });
});

app.post('/admin/requests/:id/update', authAdmin, (req, res) => {
  const { status, visit_datetime, admin_note } = req.body;
  db.prepare(`UPDATE visit_requests SET status=?, visit_datetime=?, admin_note=?, updated_at=datetime('now') WHERE id=?`)
    .run(status, visit_datetime || null, admin_note || null, req.params.id);
  res.redirect('/admin/requests/' + req.params.id);
});


app.get('/contact', optionalUser, (req, res) => {
  const wa = getSetting('contact_whatsapp', '');
  const phone = getSetting('contact_phone', '');
  const label = getSetting('contact_label', 'پشتیبانی واتساپ');
  const waDigits = String(wa).replace(/[^0-9]/g, '');
  const qrUrl = waDigits ? ('https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=' + encodeURIComponent('https://wa.me/' + waDigits)) : '';
  res.render('contact', { user: req.user, wa, phone, label, waDigits, qrUrl, title: 'تماس با ما' });
});

app.get('/admin/settings', authAdmin, (req, res) => {
  res.render('admin/settings', {
    admin: req.admin,
    contact_whatsapp: getSetting('contact_whatsapp', ''),
    contact_phone: getSetting('contact_phone', ''),
    contact_label: getSetting('contact_label', 'پشتیبانی واتساپ'),
    next_user_code: getSetting('next_user_code', '200'),
    title: 'تنظیمات'
  });
});

app.post('/admin/settings', authAdmin, (req, res) => {
  setSetting('contact_whatsapp', sanitizeText(req.body.contact_whatsapp, 30));
  setSetting('contact_phone', sanitizeText(req.body.contact_phone, 30));
  setSetting('contact_label', sanitizeText(req.body.contact_label, 80) || 'پشتیبانی واتساپ');
  const n = parseInt(req.body.next_user_code, 10);
  if (Number.isFinite(n) && n >= 200) setSetting('next_user_code', String(n));
  res.redirect('/admin/settings');
});

app.get('/admin/users', authAdmin, (req, res) => {
  const users = db.prepare('SELECT id, user_code, full_name, phone_am, whatsapp, created_at FROM users ORDER BY user_code ASC').all();
  res.render('admin/users', { admin: req.admin, users, title: 'کاربران' });
});


try { require('./utils/init-db'); } catch (e) { console.log('init:', e.message); }

app.listen(PORT, '0.0.0.0', () => console.log('Amlak server on port', PORT));

