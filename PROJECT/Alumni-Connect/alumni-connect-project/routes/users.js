/**
 * routes/users.js — Dashboard, alumni directory, profiles and notifications.
 *
 * Identity comes from the session token, not from a query parameter, so one
 * user cannot read another user's dashboard or notifications by guessing an id.
 *
 * Search ranking uses a hand-written bounded max-heap (lib/sort.js topK) so a
 * directory of n mentors with a page size of k costs O(n log k) instead of
 * sorting the whole list.
 *
 * Time complexity:
 *   dashboard()            O(n) over users/posts/events, notifications O(m)
 *   alumniDirectory()      O(n log k) for ranking, O(log n + r) for batch range
 *   markNotificationRead() O(1)
 *
 * Space complexity: O(n) for candidate scores, O(k) for the result heap
 */

var storage = require('../lib/storage');
var auth = require('./auth');
var sort = require('../lib/sort');

var DEFAULT_LIMIT = 24;
var MAX_LIMIT = 100;

/** Parse a comma/semicolon separated skill or tag list into lowercase parts. */
function splitList(value) {
  if (!value) return [];
  var raw = String(value).toLowerCase();
  var parts = raw.split(/[,;|/]/);
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (p) out.push(p);
  }
  return out;
}

/** Text a profile is searched against. */
function profileText(u) {
  return [
    u.name, u.department, u.batch, u.skills, u.interests,
    u.industry, u.experience, u.bio, u.company, u.location
  ].join(' ').toLowerCase();
}

/** Count how many of `terms` appear in `haystack` (substring, O(len) each). */
function countHits(haystack, terms) {
  var hits = 0;
  for (var i = 0; i < terms.length; i++) {
    if (haystack.indexOf(terms[i]) !== -1) hits++;
  }
  return hits;
}

// ---- Dashboard -----------------------------------------------------------

/**
 * Everything the dashboard renders for one user.
 * Returns null when the user does not exist.
 */
function dashboard(userId, viewer) {
  var u = storage.readAlive('users', userId);
  if (!u) return null;

  var users = storage.readAll('users');
  var mentors = storage.readAll('mentorship');
  var posts = storage.readAll('posts');
  var events = storage.readAll('events');
  var notifs = storage.readAll('notifications');

  var mentorCount = 0;
  var openRequests = 0;
  var activeSessions = 0;
  for (var i = 0; i < users.length; i++) if (users[i].role === 'alumni') mentorCount++;

  for (var m = 0; m < mentors.length; m++) {
    var rec = mentors[m];
    if (u.role === 'student') {
      if (rec.studentId === userId && rec.status === 'accepted') activeSessions++;
      if (rec.studentId === userId && rec.status === 'pending') openRequests++;
    } else if (rec.alumniId === userId) {
      if (rec.status === 'accepted' || rec.status === 'in-progress') activeSessions++;
      if (rec.status === 'pending') openRequests++;
    }
  }

  // Newest first. Feed ranking itself lands in a later phase; here we take the
  // most recent items the viewer could act on.
  var relevant = [];
  for (var p = posts.length - 1; p >= 0 && relevant.length < 4; p--) {
    if (u.role === 'admin' || posts[p].type === 'internship' || posts[p].type === 'workshop') {
      relevant.push(posts[p]);
    }
  }

  var upcoming = sort.mergeSortBy(events, function (e) { return String(e.date || '9999-99-99'); });
  upcoming = upcoming.slice(0, 4);

  var mine = [];
  for (var n = notifs.length - 1; n >= 0 && mine.length < 8; n--) {
    if (notifs[n].userId === userId) mine.push(notifs[n]);
  }
  var unread = 0;
  for (var r = 0; r < notifs.length; r++) {
    if (notifs[r].userId === userId && !notifs[r].read) unread++;
  }

  var stats = {
    alumni: mentorCount,
    mentors: activeSessions,
    pending: openRequests,
    opportunities: posts.length,
    events: events.length,
    unreadNotifications: unread
  };
  if (u.role === 'admin') stats.pending = stats.pending; // admin sees the same queue count

  return {
    user: auth.userPublic(u),
    role: u.role,
    stats: stats,
    upcoming: upcoming,
    posts: relevant,
    notifications: mine
  };
}

// ---- Alumni directory ----------------------------------------------------

/**
 * Filtered, ranked mentor directory.
 *
 * `limit` candidates are chosen with the bounded heap in lib/sort.js.
 * Batch filtering goes through the sorted index + binary search when a range
 * is supplied, so it does not scan the whole user table.
 */
function alumniDirectory(params) {
  var q = auth.clean(params.q).toLowerCase();
  var skill = auth.clean(params.skill).toLowerCase();
  var industry = auth.clean(params.industry).toLowerCase();
  var department = auth.clean(params.department).toLowerCase();
  var availability = auth.clean(params.availability).toLowerCase();
  var batchFrom = auth.clean(params.batchFrom);
  var batchTo = auth.clean(params.batchTo);
  var limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(params.limit, 10) || DEFAULT_LIMIT));

  // Narrow with the sorted index first when a batch range is given.
  var candidates;
  var ranged = false;
  if (batchFrom || batchTo) {
    var from = batchFrom ? padBatch(batchFrom) : '0000';
    var to = batchTo ? padBatch(batchTo) : '9999';
    if (from > to) { var t = from; from = to; to = t; }
    var ids = storage.binarySearchRange('users', 'batch', from, to);
    candidates = storage.readMany('users', ids);
    ranged = true;
  } else {
    candidates = storage.readAll('users');
  }

  var terms = q ? splitList(q) : [];
  var skillTerms = splitList(skill);
  var pool = [];
  for (var i = 0; i < candidates.length; i++) {
    var u = candidates[i];
    if (u.role !== 'alumni' && u.role !== 'admin') continue;
    if (ranged) pool.push(u);
    else pool.push(u);
  }

  var scored = [];
  for (var j = 0; j < pool.length; j++) {
    var user = pool[j];
    var text = profileText(user);
    var score = 0;

    if (terms.length) {
      score += countHits(text, terms) * 4;
      // Whole-token matches rank above substring matches.
      for (var t = 0; t < terms.length; t++) {
        if ((' ' + text + ' ').indexOf(' ' + terms[t] + ' ') !== -1) score += 3;
      }
    }
    if (skillTerms.length) score += countHits(text, skillTerms) * 5;
    if (industry && String(user.industry || '').toLowerCase().indexOf(industry) !== -1) score += 3;
    if (department && String(user.department || '').toLowerCase() === department) score += 4;
    if (availability) {
      var slots = splitList(user.availability);
      if (slots.length && countHits(availability, slots)) score += 4;
      if (String(user.availability || '').toLowerCase().indexOf(availability) !== -1) score += 2;
    }
    if (user.verified) score += 1;
    if (!terms.length && !skillTerms.length && !industry && !department && !availability) score += 1;

    if (score <= 0) continue;
    scored.push({ user: auth.userPublic(user), score: score });
  }

  var ranked = sort.topK(scored, limit, function (e) { return e.score; });
  var results = [];
  for (var r = 0; r < ranked.length; r++) {
    var out = {};
    for (var key in ranked[r].user) out[key] = ranked[r].user[key];
    out._score = ranked[r].score;
    results.push(out);
  }
  return { results: results, matched: scored.length };
}

function padBatch(batch) {
  var b = String(batch === undefined || batch === null ? '' : batch).trim();
  if (!b) return '0000';
  while (b.length < 4) b = '0' + b;
  return b;
}

// ---- Notifications -------------------------------------------------------

/** Notifications addressed to one user, newest first. */
function notificationsFor(userId, limit) {
  var all = storage.readAll('notifications');
  var mine = [];
  for (var i = 0; i < all.length; i++) {
    if (all[i].userId === userId) mine.push(all[i]);
  }
  var newestFirst = [];
  for (var n = mine.length - 1; n >= 0; n--) newestFirst.push(mine[n]);
  newestFirst = sort.mergeSortBy(newestFirst, function (x) { return String(x.createdAt || ''); });
  newestFirst.reverse();

  var cap = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  var unread = 0;
  for (var u = 0; u < newestFirst.length; u++) if (!newestFirst[u].read) unread++;
  return { notifications: newestFirst.slice(0, cap), unread: unread };
}

/** Mark one notification read. Always resolves, never returns a bare value. */
function markNotificationRead(userId, notificationId) {
  var rec = storage.readOne('notifications', notificationId);
  if (!rec || rec.userId !== userId) return Promise.resolve(false);
  if (rec.read) return Promise.resolve(true);
  return storage.updateRecord('notifications', notificationId, {
    read: true,
    readAt: new Date().toISOString()
  }).then(function () { return true; });
}

function markAllNotificationsRead(userId) {
  var all = storage.readAll('notifications');
  var jobs = [];
  for (var i = 0; i < all.length; i++) {
    if (all[i].userId === userId && !all[i].read) {
      jobs.push(storage.updateRecord('notifications', all[i].id, {
        read: true,
        readAt: new Date().toISOString()
      }));
    }
  }
  return Promise.all(jobs).then(function () { return jobs.length; });
}

// ---- Profile -------------------------------------------------------------

/** Public profile of a single user, safe to show to anyone signed in. */
function profile(viewerId, targetId) {
  var target = storage.readAlive('users', targetId);
  if (!target) return null;
  var viewer = viewerId ? storage.readAlive('users', viewerId) : null;
  var out = auth.userPublic(target);
  out.isSelf = !!(viewer && viewer.id === target.id);
  return out;
}

module.exports = {
  dashboard: dashboard,
  alumniDirectory: alumniDirectory,
  notificationsFor: notificationsFor,
  markNotificationRead: markNotificationRead,
  markAllNotificationsRead: markAllNotificationsRead,
  profile: profile,
  splitList: splitList
};