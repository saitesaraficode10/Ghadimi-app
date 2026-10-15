const crypto = require('crypto');

function isHttps(req) {
  if (process.env.FORCE_INSECURE_COOKIES === '1') return false;
  if (process.env.FORCE_SECURE_COOKIES === '1') return true;
  if (req && (req.secure || req.headers['x-forwarded-proto'] === 'https')) return true;
  // Render / production behind TLS
  return process.env.NODE_ENV === 'production';
}

function csrfToken(req, res, next) {
  let token = req.cookies && req.cookies.csrf_token;
  if (!token) {
    token = crypto.randomBytes(24).toString('hex');
    res.cookie('csrf_token', token, {
      httpOnly: false,
      sameSite: 'lax',
      secure: isHttps(req),
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    });
  }
  res.locals.csrfToken = token;
  next();
}

function verifyCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const ct = String(req.headers['content-type'] || '');
  if (ct.includes('multipart/form-data')) {
    req.csrfDeferred = true;
    return next();
  }
  const sent = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
  const cookie = req.cookies && req.cookies.csrf_token;
  if (!sent || !cookie || String(sent) !== String(cookie)) {
    // Friendly message instead of raw 403 for browser forms
    if (req.path && (req.path.startsWith('/admin/login') || req.path === '/login' || req.path === '/register')) {
      return res.status(403).render(req.path.includes('admin') ? 'admin/login' : (req.path === '/register' ? 'register' : 'login'), {
        error: 'نشست امنیتی منقضی شد. صفحه را رفرش کنید و دوباره تلاش کنید.',
        title: 'خطا',
        csrfToken: cookie || ''
      });
    }
    return res.status(403).send('CSRF validation failed — لطفاً صفحه را رفرش کنید');
  }
  next();
}

function checkCsrfAfterMulter(req, res) {
  const sent = req.body && req.body._csrf;
  const cookie = req.cookies && req.cookies.csrf_token;
  if (!sent || !cookie || String(sent) !== String(cookie)) {
    res.status(403).send('CSRF validation failed — صفحه را رفرش کنید');
    return false;
  }
  return true;
}

function sanitizeText(str, max = 500) {
  if (str == null) return '';
  return String(str).replace(/[<>]/g, '').trim().slice(0, max);
}

function isValidPhone(p) {
  return /^[+0-9\s()-]{7,20}$/.test(String(p || ''));
}

function checkLoginLock(db, key) {
  try {
    const row = db.prepare('SELECT * FROM login_attempts WHERE key = ?').get(key);
    if (!row) return { ok: true };
    if (row.locked_until) {
      const until = Date.parse(row.locked_until);
      if (Number.isFinite(until) && until > Date.now()) {
        return { ok: false, minutes: Math.ceil((until - Date.now()) / 60000) };
      }
    }
    return { ok: true, attempts: row.attempts || 0 };
  } catch (e) {
    return { ok: true };
  }
}

function recordLoginFail(db, key) {
  try {
    const row = db.prepare('SELECT * FROM login_attempts WHERE key = ?').get(key);
    const attempts = (row ? row.attempts : 0) + 1;
    let locked = null;
    if (attempts >= 8) locked = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    if (row) {
      db.prepare("UPDATE login_attempts SET attempts=?, locked_until=?, updated_at=datetime('now') WHERE key=?").run(attempts, locked, key);
    } else {
      db.prepare('INSERT INTO login_attempts (key, attempts, locked_until) VALUES (?, ?, ?)').run(key, attempts, locked);
    }
    return { attempts, locked };
  } catch (e) {
    return { attempts: 0, locked: null };
  }
}

function clearLoginFail(db, key) {
  try { db.prepare('DELETE FROM login_attempts WHERE key = ?').run(key); } catch (e) {}
}

module.exports = {
  csrfToken,
  verifyCsrf,
  checkCsrfAfterMulter,
  sanitizeText,
  isValidPhone,
  checkLoginLock,
  recordLoginFail,
  clearLoginFail,
  isHttps
};
