/**
 * migrate.js — One-time migration for the Phase 1 storage engine.
 *
 * Usage: node migrate.js
 *
 * 1. Rehash any legacy plain-text passwords as scrypt(salt + password).
 * 2. Backfill createdAt on records that predate the field.
 * 3. Rebuild the hash and sorted indexes, because both this script and
 *    seed.js write data/*.txt directly and would otherwise leave the .idx
 *    files missing (readOne would then have no offset to seek to).
 *
 * Safe to run repeatedly.
 */

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var DATA_DIR = path.join(__dirname, 'data');
var SALT_LEN = 16;
var KEY_LEN = 64;
var COST = 16384;

function padBatch(batch) {
  var b = String(batch === undefined || batch === null ? '' : batch).trim();
  if (!b) return '9999';
  while (b.length < 4) b = '0' + b;
  return b;
}
void padBatch;

/**
 * Rewrite one .txt file in place, passing each parsed record through `fix`.
 * Uses a temp file plus rename so a crash cannot truncate the log.
 * Returns the number of records changed.
 */
function rewriteCollection(name, fix) {
  var file = path.join(DATA_DIR, name + '.txt');
  if (!fs.existsSync(file)) return 0;

  var lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  var out = [];
  var changed = 0;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var rec;
    try { rec = JSON.parse(line); } catch (e) { out.push(line); continue; }
    var next = fix(rec);
    if (next !== null) { rec = next; changed++; }
    out.push(JSON.stringify(rec));
  }

  var tmp = file + '.tmp';
  fs.writeFileSync(tmp, out.length ? out.join('\n') + '\n' : '', 'utf8');
  fs.renameSync(tmp, file);
  return changed;
}

// ---- 1. Passwords --------------------------------------------------------
var usersFile = path.join(DATA_DIR, 'users.txt');
var migrated = 0;
var skipped = 0;

if (fs.existsSync(usersFile)) {
  var lines = fs.readFileSync(usersFile, 'utf8').split(/\r?\n/);
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var u;
    try { u = JSON.parse(line); } catch (e) { out.push(line); continue; }

    // "salt:hash" is the new format; anything else is legacy plain text.
    if (!u.password || u.password.indexOf(':') !== -1) {
      skipped++;
    } else {
      var salt = crypto.randomBytes(SALT_LEN).toString('hex');
      var hash = crypto.scryptSync(u.password, salt, KEY_LEN, { N: COST });
      u.password = salt + ':' + hash.toString('hex');
      migrated++;
      console.log('Migrated password: ' + u.email + ' (id=' + u.id + ')');
    }
    if (!u.createdAt) u.createdAt = new Date().toISOString();
    if (!u.availability) u.availability = 'Weekday evenings; Saturday mornings';
    out.push(JSON.stringify(u));
  }
  var usersTmp = usersFile + '.tmp';
  fs.writeFileSync(usersTmp, out.join('\n') + '\n', 'utf8');
  fs.renameSync(usersTmp, usersFile);
  console.log('Passwords — migrated: ' + migrated + ', already hashed: ' + skipped);
} else {
  console.log('No users.txt found; skipping password migration.');
}

// ---- 2. Backfill missing timestamps on the other collections -------------
['mentorship', 'posts', 'events', 'connections', 'notifications'].forEach(function (name) {
  var n = rewriteCollection(name, function (rec) {
    if (!rec.createdAt) { rec.createdAt = new Date().toISOString(); return rec; }
    return null;
  });
  if (n) console.log('Backfilled createdAt on ' + n + ' ' + name + ' record(s).');
});

// ---- 3. Rebuild indexes --------------------------------------------------
var storage = require('./lib/storage');
var report = storage.ensureIndexes();
if (report.length) {
  console.log('Indexes rebuilt:');
  for (var r = 0; r < report.length; r++) console.log('  ' + JSON.stringify(report[r]));
} else {
  console.log('Indexes already up to date.');
}

// Report the sort-key padding so the batch index is verifiably sane.
var batchIdx = storage.readSortedIndex('users', 'batch');
if (batchIdx.length) {
  console.log('users sorted indexes: name=' + storage.readSortedIndex('users', 'name').length +
    ', batch=' + batchIdx.length + ' (range ' + batchIdx[0].key + '..' + batchIdx[batchIdx.length - 1].key + ')');
}

console.log('Migration complete.');
