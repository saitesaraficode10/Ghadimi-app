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
const { csrfToken, verifyCsrf, checkCsrfAfterMulter, sanitizeText, isValidPhone, checkLoginLock, recordLoginFail, clearLoginFail } = require('./middleware/security');

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
      "script-src-attr": ["'none'"],
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
  limits: { fileSize: 5 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|webp/i.test(file.mimetype);
    if (!ok) return cb(new Error('فقط تصویر jpg/png/webp مجاز است'));
    cb(null, true);
  }
});

function savePropertyImages(propertyId, files) {
  if (!files || !files.length) return;
  const ins = db.prepare('INSERT INTO property_images (property_id, path, sort_order) VALUES (?, ?, ?)');
  files.forEach((f, i) => {
    ins.run(propertyId, '/uploads/properties/' + f.filename, i);
  });
  // set cover if empty
  const prop = db.prepare('SELECT image_path FROM properties WHERE id = ?').get(propertyId);
  if (prop && !prop.image_path && files[0]) {
    db.prepare('UPDATE properties SET image_path = ? WHERE id = ?').run('/uploads/properties/' + files[0].filename, propertyId);
  }
}

function getPropertyImages(propertyId) {
  return db.prepare('SELECT * FROM property_images WHERE property_id = ? ORDER BY sort_order ASC, id ASC').all(propertyId);
}


function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  const row = db.prepare('SELECT key FROM settings WHERE key = ?').get(key);
  if (row) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(value), key);
  else db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}

function smartOnlineCount() {
  const h = new Date().getHours();
  let base = 5;
  if (h >= 8 && h < 11) base = 9;
  else if (h >= 11 && h < 14) base = 13;
  else if (h >= 14 && h < 18) base = 16;
  else if (h >= 18 && h < 22) base = 12;
  else if (h >= 22 || h < 2) base = 7;
  else base = 4;
  const wave = Math.abs(Math.sin(Date.now() / 420000)) * 4;
  return Math.max(3, Math.round(base + wave));
}
function bumpViews() {
  let v = parseInt(getSetting('page_views', '1287'), 10) || 1287;
  let u = parseInt(getSetting('unique_visitors', '864'), 10) || 864;
  v += 1;
  if (Math.random() < 0.35) u += 1;
  setSetting('page_views', String(v));
  setSetting('unique_visitors', String(u));
  return { views: v, uniques: u };
}
function isOnline(lastSeen) {
  if (!lastSeen) return false;
  const t = Date.parse(lastSeen);
  if (!Number.isFinite(t)) return false;
  return (Date.now() - t) < 3 * 60 * 1000;
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

  const viewStats = bumpViews();
  res.render('index', {
    user: req.user, properties, favIds,
    filters: { city, status, rooms, price_from, price_to, area_from },
    onlineNow: smartOnlineCount(),
    pageViews: viewStats.views,
    uniqueVisitors: viewStats.uniques,
    title: t(res.locals.lang, 'home')
  });
});

app.get('/property/:code', authUser, (req, res) => {
  const property = db.prepare('SELECT * FROM properties WHERE code = ?').get(req.params.code);
  if (!property) return res.status(404).send('Not found');
  let isFav = false;
  if (req.user) {
    isFav = !!db.prepare('SELECT id FROM favorites WHERE user_id = ? AND property_id = ?').get(req.user.id, property.id);
  }
  let images = [];
  try { images = getPropertyImages(property.id); } catch (e) {}
  if (!images.length && property.image_path) images = [{ path: property.image_path }];
  res.render('property', { user: req.user, property, images, isFav, error: null, title: property.title });
});

app.post('/property/:code/visit', authUser, (req, res) => {
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
    let images = [];
    try { images = getPropertyImages(property.id); } catch (e) {}
    if (!images.length && property.image_path) images = [{ path: property.image_path }];
    return res.render('property', { user: req.user, property, images, isFav, error: 'لطفاً فیلدهای ضروری را درست پر کنید', title: property.title });
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
  const phone_cc = sanitizeText(req.body.phone_cc, 8) || '+374';
  const phone_local = sanitizeText(req.body.phone_local, 20).replace(/^0+/, '');
  const wa_cc = sanitizeText(req.body.wa_cc, 8) || phone_cc;
  const wa_local = sanitizeText(req.body.wa_local, 20).replace(/^0+/, '');
  const phone_am = (phone_cc + phone_local).replace(/\s/g, '');
  const whatsapp = (wa_cc + wa_local).replace(/\s/g, '');
  const password = String(req.body.password || '');
  if (!full_name || !phone_local || !wa_local || password.length < 6) {
    return res.render('register', { error: 'نام، شماره تماس، واتساپ و رمز (حداقل ۶) الزامی است', title: 'ثبت‌نام' });
  }
  if (!isValidPhone(phone_am) || !isValidPhone(whatsapp)) {
    return res.render('register', { error: 'فرمت شماره تماس یا واتساپ نامعتبر است', title: 'ثبت‌نام' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const user_code = nextUserCode();
    db.prepare("INSERT INTO users (user_code, full_name, phone_am, whatsapp, password_hash, last_seen) VALUES (?, ?, ?, ?, ?, datetime('now'))")
      .run(user_code, full_name, phone_am, whatsapp, hash);
    const invite_token = sanitizeText(req.body.invite_token, 64);
    if (invite_token) {
      try {
        db.prepare("UPDATE invites SET used=1, used_at=datetime('now') WHERE token=? AND used=0").run(invite_token);
      } catch (e) {}
    }
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
  const lockKey = 'user:' + phone;
  try {
    const lock = checkLoginLock(db, lockKey);
    if (!lock.ok) return res.render('login', { error: 'حساب موقتاً قفل است. ' + lock.minutes + ' دقیقه صبر کنید', title: 'ورود' });
  } catch (e) {}
  const user = db.prepare('SELECT * FROM users WHERE phone_am = ?').get(phone);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    try { recordLoginFail(db, lockKey); } catch (e) {}
    return res.render('login', { error: 'شماره یا رمز اشتباه', title: 'ورود' });
  }
  try { clearLoginFail(db, lockKey); } catch (e) {}
  try { db.prepare("UPDATE users SET last_seen = datetime('now') WHERE id = ?").run(user.id); } catch (e) {}
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
  const username = sanitizeText(req.body.username, 40);
  const password = String(req.body.password || '');
  const lockKey = 'admin:' + username;
  try {
    const lock = checkLoginLock(db, lockKey);
    if (!lock.ok) return res.render('admin/login', { error: 'قفل موقت: ' + lock.minutes + ' دقیقه', title: 'Admin' });
  } catch (e) {}
  const ok =
    (username === process.env.ADMIN1_USERNAME && password === process.env.ADMIN1_PASSWORD) ||
    (username === process.env.ADMIN2_USERNAME && password === process.env.ADMIN2_PASSWORD);
  if (!ok) {
    try { recordLoginFail(db, lockKey); } catch (e) {}
    return res.render('admin/login', { error: 'نام کاربری یا رمز اشتباه', title: 'Admin' });
  }
  try { clearLoginFail(db, lockKey); } catch (e) {}
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
  res.render('admin/property-form', { admin: req.admin, property: null, images: [], error: null, title: 'New' });
});

app.post('/admin/properties/new', authAdmin, (req, res) => {
  upload.array('images', 20)(req, res, (err) => {
    if (!checkCsrfAfterMulter(req, res)) return;
    if (err) {
      return res.render('admin/property-form', { admin: req.admin, property: null, images: [], error: err.message || 'خطا در آپلود تصویر', title: 'New' });
    }
    try {
      const b = req.body;
      const code = sanitizeText(b.code, 30);
      const title = sanitizeText(b.title, 120);
      if (!code || !title || !b.price_monthly) {
        return res.render('admin/property-form', { admin: req.admin, property: null, images: [], error: 'کد ملک، عنوان و قیمت الزامی است', title: 'New' });
      }
      const image_path = (req.files && req.files[0]) ? ('/uploads/properties/' + req.files[0].filename) : null;
      const info = db.prepare(`
        INSERT INTO properties (code, title, city, address, rooms, area, price_monthly, currency, description, image_path, map_url, lat, lng, contact_whatsapp, status, available_from, max_people)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        code, title, sanitizeText(b.city, 80) || 'Yerevan', sanitizeText(b.address, 120) || null,
        parseInt(b.rooms || '1', 10), b.area ? parseFloat(b.area) : null,
        parseFloat(b.price_monthly), sanitizeText(b.currency, 10) || 'AMD', sanitizeText(b.description, 5000) || null, image_path,
        sanitizeText(b.map_url, 500) || null, b.lat ? parseFloat(b.lat) : null, b.lng ? parseFloat(b.lng) : null,
        sanitizeText(b.contact_whatsapp, 30) || null, b.status || 'available', b.available_from || null,
        parseInt(b.max_people || '2', 10)
      );
      savePropertyImages(info.lastInsertRowid, req.files || []);
      res.redirect('/admin/properties');
    } catch (e) {
      console.error(e);
      return res.render('admin/property-form', { admin: req.admin, property: null, images: [], error: 'کد ملک تکراری است یا خطا در ذخیره: ' + e.message, title: 'New' });
    }
  });
});

app.get('/admin/properties/:id/edit', authAdmin, (req, res) => {
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!property) return res.redirect('/admin/properties');
  const images = getPropertyImages(property.id);
  res.render('admin/property-form', { admin: req.admin, property, images, error: null, title: 'Edit' });
});

app.post('/admin/properties/:id/edit', authAdmin, (req, res) => {
  upload.array('images', 20)(req, res, (err) => {
    if (!checkCsrfAfterMulter(req, res)) return;
    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
    if (!property) return res.redirect('/admin/properties');
    if (err) {
      return res.render('admin/property-form', { admin: req.admin, property, images: getPropertyImages(property.id), error: err.message || 'خطا در آپلود', title: 'Edit' });
    }
    try {
      const b = req.body;
      // delete selected images
      let del = b.delete_images;
      if (del) {
        if (!Array.isArray(del)) del = [del];
        const delStmt = db.prepare('DELETE FROM property_images WHERE id = ? AND property_id = ?');
        del.forEach(id => delStmt.run(parseInt(id, 10), property.id));
      }
      db.prepare(`
        UPDATE properties SET title=?, city=?, address=?, rooms=?, area=?, price_monthly=?, currency=?, description=?,
          map_url=?, lat=?, lng=?, contact_whatsapp=?, status=?, available_from=?, max_people=?, updated_at=datetime('now')
        WHERE id=?
      `).run(
        sanitizeText(b.title, 120), sanitizeText(b.city, 80), sanitizeText(b.address, 120) || null,
        parseInt(b.rooms || '1', 10), b.area ? parseFloat(b.area) : null,
        parseFloat(b.price_monthly), sanitizeText(b.currency, 10) || 'AMD', sanitizeText(b.description, 5000) || null,
        sanitizeText(b.map_url, 500) || null, b.lat ? parseFloat(b.lat) : null, b.lng ? parseFloat(b.lng) : null,
        sanitizeText(b.contact_whatsapp, 30) || null, b.status, b.available_from || null,
        parseInt(b.max_people || '2', 10), property.id
      );
      savePropertyImages(property.id, req.files || []);
      // refresh cover
      const first = db.prepare('SELECT path FROM property_images WHERE property_id = ? ORDER BY sort_order, id LIMIT 1').get(property.id);
      if (first) db.prepare('UPDATE properties SET image_path = ? WHERE id = ?').run(first.path, property.id);
      res.redirect('/admin/properties');
    } catch (e) {
      console.error(e);
      return res.render('admin/property-form', { admin: req.admin, property, images: getPropertyImages(property.id), error: 'خطا در ذخیره: ' + e.message, title: 'Edit' });
    }
  });
});

app.post('/admin/properties/:id/delete', authAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    db.prepare('DELETE FROM property_images WHERE property_id = ?').run(id);
    db.prepare('DELETE FROM favorites WHERE property_id = ?').run(id);
    db.prepare('DELETE FROM visit_requests WHERE property_id = ?').run(id);
    db.prepare('DELETE FROM properties WHERE id = ?').run(id);
  } catch (e) {
    console.error('delete property', e.message);
  }
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
  const status = sanitizeText(req.body.status, 30);
  const visit_datetime = sanitizeText(req.body.visit_datetime, 40);
  const visit_location = sanitizeText(req.body.visit_location, 200);
  const admin_note = sanitizeText(req.body.admin_note, 1000);
  try {
    db.prepare(`UPDATE visit_requests SET status=?, visit_datetime=?, visit_location=?, admin_note=?, updated_at=datetime('now') WHERE id=?`)
      .run(status, visit_datetime || null, visit_location || null, admin_note || null, req.params.id);
  } catch (e) {
    // older DB without visit_location column
    db.prepare(`UPDATE visit_requests SET status=?, visit_datetime=?, admin_note=?, updated_at=datetime('now') WHERE id=?`)
      .run(status, visit_datetime || null, admin_note || null, req.params.id);
  }
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
    pay_card_ir: getSetting('pay_card_ir', ''),
    pay_card_ir_enabled: getSetting('pay_card_ir_enabled', '0'),
    pay_card_am: getSetting('pay_card_am', ''),
    pay_card_am_enabled: getSetting('pay_card_am_enabled', '0'),
    pay_card_visa: getSetting('pay_card_visa', ''),
    pay_card_visa_enabled: getSetting('pay_card_visa_enabled', '0'),
    pay_card_note: getSetting('pay_card_note', ''),
    title: 'تنظیمات'
  });
});

app.post('/admin/settings', authAdmin, (req, res) => {
  setSetting('contact_whatsapp', sanitizeText(req.body.contact_whatsapp, 30));
  setSetting('contact_phone', sanitizeText(req.body.contact_phone, 30));
  setSetting('contact_label', sanitizeText(req.body.contact_label, 80) || 'پشتیبانی واتساپ');
  const n = parseInt(req.body.next_user_code, 10);
  if (Number.isFinite(n) && n >= 200) setSetting('next_user_code', String(n));
  setSetting('pay_card_ir', sanitizeText(req.body.pay_card_ir, 40));
  setSetting('pay_card_ir_enabled', req.body.pay_card_ir_enabled === '1' ? '1' : '0');
  setSetting('pay_card_am', sanitizeText(req.body.pay_card_am, 40));
  setSetting('pay_card_am_enabled', req.body.pay_card_am_enabled === '1' ? '1' : '0');
  setSetting('pay_card_visa', sanitizeText(req.body.pay_card_visa, 40));
  setSetting('pay_card_visa_enabled', req.body.pay_card_visa_enabled === '1' ? '1' : '0');
  setSetting('pay_card_note', sanitizeText(req.body.pay_card_note, 500));
  res.redirect('/admin/settings');
});

app.get('/admin/users', authAdmin, (req, res) => {
  const users = db.prepare('SELECT id, user_code, full_name, phone_am, whatsapp, created_at, last_seen FROM users ORDER BY user_code ASC').all();
  res.render('admin/users', { admin: req.admin, users, isOnline, title: 'کاربران' });
});



app.post('/api/presence', optionalUser, (req, res) => {
  if (req.user) {
    try { db.prepare("UPDATE users SET last_seen = datetime('now') WHERE id = ?").run(req.user.id); } catch (e) {}
  }
  res.json({ ok: true, online: smartOnlineCount() });
});

app.get('/profile', authUser, (req, res) => {
  res.render('profile', { user: req.user, error: null, ok: null, title: 'پروفایل من' });
});

app.post('/profile', authUser, (req, res) => {
  const full_name = sanitizeText(req.body.full_name, 80);
  const phone_cc = sanitizeText(req.body.phone_cc, 8) || '+374';
  const phone_local = sanitizeText(req.body.phone_local, 20).replace(/^0+/, '');
  const wa_cc = sanitizeText(req.body.wa_cc, 8) || phone_cc;
  const wa_local = sanitizeText(req.body.wa_local, 20).replace(/^0+/, '');
  const phone_am = (phone_cc + phone_local).replace(/\s/g, '');
  const whatsapp = (wa_cc + wa_local).replace(/\s/g, '');
  if (!full_name || !phone_local || !wa_local || !isValidPhone(phone_am) || !isValidPhone(whatsapp)) {
    return res.render('profile', { user: req.user, error: 'اطلاعات نامعتبر است', ok: null, title: 'پروفایل من' });
  }
  try {
    db.prepare('UPDATE users SET full_name=?, phone_am=?, whatsapp=? WHERE id=?').run(full_name, phone_am, whatsapp, req.user.id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.render('profile', { user, error: null, ok: 'ذخیره شد', title: 'پروفایل من' });
  } catch (e) {
    res.render('profile', { user: req.user, error: 'شماره تکراری است یا خطا', ok: null, title: 'پروفایل من' });
  }
});

app.post('/admin/users/:id/delete', authAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    db.prepare('DELETE FROM favorites WHERE user_id = ?').run(id);
    db.prepare('UPDATE visit_requests SET user_id = NULL WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  } catch (e) { console.error(e.message); }
  res.redirect('/admin/users');
});



// ---- Bookings (login required) ----
app.get('/book/:code', authUser, (req, res) => {
  const property = db.prepare('SELECT * FROM properties WHERE code = ?').get(req.params.code);
  if (!property) return res.status(404).send('Not found');
  const cards = {
    ir: getSetting('pay_card_ir_enabled', '0') === '1' ? getSetting('pay_card_ir', '') : '',
    am: getSetting('pay_card_am_enabled', '0') === '1' ? getSetting('pay_card_am', '') : '',
    visa: getSetting('pay_card_visa_enabled', '0') === '1' ? getSetting('pay_card_visa', '') : '',
    note: getSetting('pay_card_note', '')
  };
  res.render('book', { user: req.user, property, cards, error: null, title: 'رزرو ملک' });
});

app.post('/book/:code', authUser, (req, res) => {
  const property = db.prepare('SELECT * FROM properties WHERE code = ?').get(req.params.code);
  if (!property) return res.status(404).send('Not found');
  const rent_type = sanitizeText(req.body.rent_type, 20);
  const start_date = sanitizeText(req.body.start_date, 20);
  const end_date = sanitizeText(req.body.end_date, 20);
  const pay_method = sanitizeText(req.body.pay_method, 20);
  const amount = req.body.amount ? parseFloat(req.body.amount) : null;
  const cards = {
    ir: getSetting('pay_card_ir_enabled', '0') === '1' ? getSetting('pay_card_ir', '') : '',
    am: getSetting('pay_card_am_enabled', '0') === '1' ? getSetting('pay_card_am', '') : '',
    visa: getSetting('pay_card_visa_enabled', '0') === '1' ? getSetting('pay_card_visa', '') : '',
    note: getSetting('pay_card_note', '')
  };
  if (!['daily', 'monthly', 'yearly'].includes(rent_type) || !start_date || !['cash', 'online'].includes(pay_method)) {
    return res.render('book', { user: req.user, property, cards, error: 'لطفاً نوع رزرو، تاریخ و روش پرداخت را درست انتخاب کنید', title: 'رزرو ملک' });
  }
  const booking_code = 'B' + Date.now().toString().slice(-10);
  db.prepare(`
    INSERT INTO bookings (booking_code, user_id, property_id, rent_type, start_date, end_date, amount, currency, pay_method, pay_status, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending')
  `).run(booking_code, req.user.id, property.id, rent_type, start_date, end_date || null, amount, property.currency || 'AMD', pay_method);
  res.render('book-success', {
    user: req.user, booking_code, pay_method, cards, property,
    title: 'رزرو ثبت شد'
  });
});

app.get('/my-bookings', authUser, (req, res) => {
  const rows = db.prepare(`
    SELECT b.*, p.title, p.code AS property_code FROM bookings b
    JOIN properties p ON p.id = b.property_id
    WHERE b.user_id = ? ORDER BY b.created_at DESC
  `).all(req.user.id);
  res.render('my-bookings', { user: req.user, rows, title: 'رزروهای من' });
});

app.get('/admin/bookings', authAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT b.*, p.title, p.code AS property_code, u.full_name, u.user_code, u.phone_am
    FROM bookings b
    JOIN properties p ON p.id = b.property_id
    JOIN users u ON u.id = b.user_id
    ORDER BY b.created_at DESC
  `).all();
  res.render('admin/bookings', { admin: req.admin, rows, title: 'رزروها' });
});

app.post('/admin/bookings/:id/update', authAdmin, (req, res) => {
  const status = sanitizeText(req.body.status, 30);
  const pay_status = sanitizeText(req.body.pay_status, 30);
  const admin_note = sanitizeText(req.body.admin_note, 1000);
  db.prepare(`UPDATE bookings SET status=?, pay_status=?, admin_note=?, updated_at=datetime('now') WHERE id=?`)
    .run(status, pay_status, admin_note || null, req.params.id);
  res.redirect('/admin/bookings');
});

// ---- Invites ----
const crypto = require('crypto');
app.get('/admin/invites', authAdmin, (req, res) => {
  const invites = db.prepare('SELECT * FROM invites ORDER BY created_at DESC LIMIT 100').all();
  const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '') || '';
  res.render('admin/invites', { admin: req.admin, invites, base, host: '', title: 'دعوت ثبت‌نام' });
});

app.post('/admin/invites', authAdmin, (req, res) => {
  const full_name = sanitizeText(req.body.full_name, 80);
  const phone = sanitizeText(req.body.phone, 30);
  const note = sanitizeText(req.body.note, 200);
  if (!phone) return res.redirect('/admin/invites');
  const token = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO invites (token, full_name, phone, note, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(token, full_name || null, phone, note || null, req.admin.username);
  res.redirect('/admin/invites');
});

app.get('/invite/:token', (req, res) => {
  const inv = db.prepare('SELECT * FROM invites WHERE token = ?').get(req.params.token);
  if (!inv || inv.used) return res.status(400).send('لینک دعوت نامعتبر یا قبلاً استفاده شده است');
  res.render('register', { error: null, invite: inv, title: 'ثبت‌نام با دعوت' });
});


try { require('./utils/init-db'); } catch (e) { console.log('init:', e.message); }

app.use((err, req, res, next) => {
  console.error('ERR', err && err.message);
  res.status(500).send('خطای سرور');
});

app.listen(PORT, '0.0.0.0', () => console.log('Amlak server on port', PORT));


