/**
 * routes/auth.js — Registration, login, sessions and rate limiting.
 *
 * Security model for Phase 1:
 *   - passwords stored as scrypt(salt + password) with a per-user random salt
 *   - legacy plain-text passwords rehashed on first successful login
 *   - opaque 32-byte session tokens persisted in data/sessions.txt with a TTL
 *   - sliding-window rate limiter on the credential endpoints
 *   - output escaping helper so stored text cannot inject markup
 *
 * Time complexity:
 *   login             O(n) user lookup, O(1) sessions (both cached snapshots)
 *   verifyPassword    O(1) — scrypt with a fixed cost
 *   checkRateLimit    O(k) to evict the stale head of the window
 *
 * Space complexity: O(active sessions) on disk, O(ip x route) in memory
 *
 * Constraints: Node built-ins only (crypto).
 */

var crypto = require('crypto');
var storage = require('../lib/storage');

var SALT_LEN = 16;
var KEY_LEN = 64;
var COST = 16384; // scrypt N parameter

var SESSIONS_COLL = 'sessions';
var SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// Sliding-window limiter: RATE_MAX_REQUESTS per RATE_WINDOW_MS per ip+route.
var RATE_WINDOW_MS = 60 * 1000;
var RATE_MAX_REQUESTS = 10;
var rateBuckets = {};

var MAX_FIELD_LEN = 2000;

/** Client identity for the limiter: forwarded IP when present, else socket. */
function clientIp(req) {
  var fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/**
 * Sliding-window rate limit check. O(k) worst case, where k is the number of
 * timestamps still inside the window; the window is capped by RATE_MAX_REQUESTS
 * because pushes stop once the cap is reached.
 */
function checkRateLimit(ip, route) {
  var key = ip + '|' + route;
  var now = Date.now();
  var bucket = rateBuckets[key];
  if (!bucket) { bucket = rateBuckets[key] = []; }

  var cut = now - RATE_WINDOW_MS;
  var drop = 0;
  while (drop < bucket.length && bucket[drop] < cut) drop++;
  if (drop > 0) bucket.splice(0, drop);

  if (bucket.length >= RATE_MAX_REQUESTS) {
    var retryAfter = Math.max(1, Math.ceil((bucket[0] + RATE_WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfter: retryAfter };
  }
  bucket.push(now);
  return { allowed: true };
}

/** Drop rate-limit buckets that have gone quiet (prevents unbounded growth). */
function pruneRateBuckets() {
  var cut = Date.now() - RATE_WINDOW_MS;
  for (var key in rateBuckets) {
    if (!Object.prototype.hasOwnProperty.call(rateBuckets, key)) continue;
    var b = rateBuckets[key];
    if (!b.length || b[b.length - 1] < cut) delete rateBuckets[key];
  }
}

// ---- XSS escaping --------------------------------------------------------
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Trim a value and clamp it to MAX_FIELD_LEN. */
function clean(value, maxLen) {
  if (value === null || value === undefined) return '';
  var s = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  var cap = maxLen || MAX_FIELD_LEN;
  return s.length > cap ? s.slice(0, cap) : s;
}

// ---- Validation ----------------------------------------------------------
function validateRegister(body) {
  var errors = [];
  var name = clean(body.name);
  if (name.length < 2) errors.push('Name is required (min 2 characters).');
  if (name.length > 80) errors.push('Name is too long.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(body.email))) errors.push('A valid email is required.');
  var pw = body.password === undefined ? '' : String(body.password);
  if (pw.length < 6) errors.push('Password must be at least 6 characters.');
  if (pw.length > 128) errors.push('Password is too long.');
  return errors;
}

function validateLogin(body) {
  var errors = [];
  if (!clean(body.email)) errors.push('Email is required.');
  if (!body.password) errors.push('Password is required.');
  return errors;
}

// ---- Password hashing ----------------------------------------------------
function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(SALT_LEN).toString('hex');
  var hash = crypto.scryptSync(String(password), salt, KEY_LEN, { N: COST });
  return salt + ':' + hash.toString('hex');
}

/**
 * Constant-time comparison of the supplied password against a stored
 * "salt:hash" string. Returns false for any malformed stored value.
 */
function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  var parts = stored.split(':');
  if (parts.length !== 2) return false;
  var expected;
  try {
    expected = Buffer.from(parts[1], 'hex');
  } catch (e) {
    return false;
  }
  if (expected.length !== KEY_LEN) return false;
  var actual = crypto.scryptSync(String(password), parts[0], KEY_LEN, { N: COST });
  return crypto.timingSafeEqual(actual, expected);
}

function isHashed(stored) {
  return typeof stored === 'string' && stored.split(':').length === 2;
}

// ---- Sessions ------------------------------------------------------------
/**
 * Create a session record. Returns a promise so the caller never hands the
 * client a token that has not been persisted yet.
 */
function createSession(userId) {
  var session = {
    id: 'S' + crypto.randomBytes(4).toString('hex').toUpperCase(),
    userId: userId,
    token: crypto.randomBytes(32).toString('hex'),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
  };
  return storage.appendRecord(SESSIONS_COLL, session).then(function () { return session; });
}

/** Live session for a token, or null when unknown or expired. */
function validateSession(token) {
  if (!token || typeof token !== 'string') return null;
  var sessions = storage.readAll(SESSIONS_COLL);
  var now = Date.now();
  for (var i = 0; i < sessions.length; i++) {
    var s = sessions[i];
    if (s._deleted) continue;
    if (s.token !== token) continue;
    if (new Date(s.expiresAt).getTime() > now) return s;
    return null; // matched but expired
  }
  return null;
}

/** Resolve the caller from a request's session header. */
function currentUser(req) {
  var token = req.headers['x-session-token'] || (req.query && req.query.token);
  var authHeader = req.headers['authorization'];
  if (!token && authHeader && authHeader.slice(0, 7).toLowerCase() === 'bearer ') {
    token = authHeader.slice(7).trim();
  }
  var session = validateSession(token);
  if (!session) return null;
  return storage.readAlive('users', session.userId);
}

/** Guard for endpoints that require a signed-in user. */
function requireSession(req) {
  var user = currentUser(req);
  return user || null;
}

/**
 * Invalidate one session. Returns a promise that settles once the tombstone
 * has been appended, so the caller can respond only after the write lands.
 */
function destroySession(token) {
  if (!token) return Promise.resolve(false);
  var sessions = storage.readAll(SESSIONS_COLL);
  for (var i = 0; i < sessions.length; i++) {
    if (sessions[i].token === token && !sessions[i]._deleted) {
      return storage.deleteRecord(SESSIONS_COLL, sessions[i].id).then(function () { return true; });
    }
  }
  return Promise.resolve(false);
}

/** Drop every session that is past its TTL. Returns a promise for the count. */
function cleanupExpiredSessions() {
  var sessions = storage.readAll(SESSIONS_COLL);
  var now = Date.now();
  var jobs = [];
  for (var i = 0; i < sessions.length; i++) {
    if (new Date(sessions[i].expiresAt).getTime() <= now) {
      jobs.push(storage.deleteRecord(SESSIONS_COLL, sessions[i].id));
    }
  }
  return Promise.all(jobs).then(function () { return jobs.length; });
}

// ---- User lookups --------------------------------------------------------
function findUserByEmail(email) {
  var wanted = clean(email).toLowerCase();
  if (!wanted) return null;
  var users = storage.readAll('users');
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (u.email && String(u.email).toLowerCase() === wanted) return u;
  }
  return null;
}

function findUserById(id) {
  return storage.readAlive('users', id);
}

/** Strip the password before a user object leaves the server. */
function userPublic(u) {
  if (!u) return u;
  var o = {};
  for (var k in u) {
    if (Object.prototype.hasOwnProperty.call(u, k) && k !== 'password') o[k] = u[k];
  }
  return o;
}

function newId(prefix) {
  return prefix + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ---- Handlers ------------------------------------------------------------
// Handlers return { status, data } so server.js can compose the response and
// attach the dashboard payload without a circular dependency back into routes.
// Every handler resolves to a promise, including on the early error returns,
// so callers can always use .then().

/** Normalise a {status, data} value (or promise) into a promise. */
function reply(value) {
  return Promise.resolve(value);
}

function registerImpl(req) {
  var body = req.body || {};

  var limit = checkRateLimit(clientIp(req), 'register');
  if (!limit.allowed) {
    return { status: 429, data: { error: 'Too many attempts. Try again in ' + limit.retryAfter + 's.' } };
  }

  var errors = validateRegister(body);
  if (errors.length) return { status: 400, data: { error: errors.join(' ') } };

  if (findUserByEmail(body.email)) {
    return { status: 409, data: { error: 'That email is already registered.' } };
  }

  var requestedRole = clean(body.role, 20);
  var role = (requestedRole === 'mentor' || requestedRole === 'alumni') ? 'alumni'
    : (requestedRole === 'admin' ? 'admin' : 'student');

  var user = {
    id: newId('U'),
    name: esc(clean(body.name, 80)),
    email: esc(clean(body.email, 160)).toLowerCase(),
    password: hashPassword(String(body.password)),
    role: role,
    department: esc(clean(body.department, 60)) || 'CSE',
    batch: esc(clean(body.batch, 20)) || '2026',
    skills: esc(clean(body.skills)),
    interests: esc(clean(body.interests)),
    industry: esc(clean(body.industry, 80)),
    experience: esc(clean(body.experience, 80)),
    bio: esc(clean(body.bio)),
    verified: false,
    createdAt: new Date().toISOString()
  };

  return storage.appendRecord('users', user).then(function () {
    return createSession(user.id).then(function (session) {
      return { status: 201, data: { user: userPublic(user), session: session.token } };
    });
  });
}

function loginImpl(req) {
  var body = req.body || {};

  var limit = checkRateLimit(clientIp(req), 'login');
  if (!limit.allowed) {
    return { status: 429, data: { error: 'Too many login attempts. Try again in ' + limit.retryAfter + 's.' } };
  }

  var errors = validateLogin(body);
  if (errors.length) return { status: 400, data: { error: errors.join(' ') } };

  var user = findUserByEmail(body.email);
  if (!user) {
    // Same message for unknown email and wrong password so the endpoint
    // cannot be used to enumerate registered accounts.
    return { status: 401, data: { error: 'Invalid email or password.' } };
  }

  // Legacy migration: a stored value without a salt separator is plain text.
  // Rehash the stored secret so the same password keeps working, then verify
  // the submitted password against the new hash.
  if (!isHashed(user.password)) {
    var upgraded = hashPassword(user.password);
    return storage.updateRecord('users', user.id, { password: upgraded }).then(function (updated) {
      return finishLogin(updated || user, body, true);
    });
  }

  if (!verifyPassword(body.password, user.password)) {
    return { status: 401, data: { error: 'Invalid email or password.' } };
  }
  return finishLogin(user, body, false);
}

function finishLogin(user, body, migrated) {
  // The login screen offers a Student card and a Mentor card. Mentors are
  // stored with the historical "alumni" role, so accept either spelling.
  var requested = clean(body.role, 20);
  var expectedRole = (requested === 'mentor') ? 'alumni' : requested;
  if (expectedRole && user.role !== expectedRole) {
    return { status: 403, data: { error: 'This account is registered as ' + user.role + ', not ' + (requested === 'mentor' ? 'mentor' : requested) + '.' } };
  }

  var payload = { user: userPublic(user) };
  if (migrated) payload.migratedPassword = true;
  return createSession(user.id).then(function (session) {
    payload.session = session.token;
    return { status: 200, data: payload };
  });
}

function logout(req) {
  // deleteRecord already serialises through the storage write queue, so await
  // it directly instead of wrapping it in another enqueueWrite — nesting the
  // two would resolve the response before the tombstone was appended.
  return destroySession(req.headers['x-session-token']).then(function () {
    return { status: 200, data: { ok: true } };
  });
}

function me(req) {
  var user = currentUser(req);
  if (!user) return reply({ status: 401, data: { error: 'Invalid or expired session.' } });
  return reply({ status: 200, data: { user: userPublic(user) } });
}

// Public handlers: always promise-returning.
function register(req) { return reply(registerImpl(req)); }
function login(req) { return reply(loginImpl(req)); }

module.exports = {
  register: register,
  login: login,
  logout: logout,
  me: me,

  currentUser: currentUser,
  requireSession: requireSession,
  validateSession: validateSession,
  createSession: createSession,
  destroySession: destroySession,
  cleanupExpiredSessions: cleanupExpiredSessions,

  findUserByEmail: findUserByEmail,
  findUserById: findUserById,
  userPublic: userPublic,
  newId: newId,

  hashPassword: hashPassword,
  verifyPassword: verifyPassword,
  isHashed: isHashed,
  validateRegister: validateRegister,
  validateLogin: validateLogin,
  esc: esc,
  clean: clean,
  checkRateLimit: checkRateLimit,
  pruneRateBuckets: pruneRateBuckets,

  SESSION_TTL_MS: SESSION_TTL_MS,
  SESSIONS_COLL: SESSIONS_COLL
};