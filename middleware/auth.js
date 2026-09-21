const jwt = require('jsonwebtoken');
const db = require('../utils/db');
const JWT_SECRET = process.env.JWT_SECRET || 'amlak-secret-change-me-32chars-min-ok';

function authUser(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.redirect('/login');
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.redirect('/login');
    req.user = user;
    next();
  } catch {
    return res.redirect('/login');
  }
}

function optionalUser(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) { req.user = null; return next(); }
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id) || null;
    next();
  } catch {
    req.user = null;
    next();
  }
}

function authAdmin(req, res, next) {
  try {
    const token = req.cookies?.admin_token;
    if (!token) return res.redirect('/admin/login');
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') return res.redirect('/admin/login');
    req.admin = { username: payload.username };
    next();
  } catch {
    return res.redirect('/admin/login');
  }
}

module.exports = { authUser, authAdmin, optionalUser, JWT_SECRET };
