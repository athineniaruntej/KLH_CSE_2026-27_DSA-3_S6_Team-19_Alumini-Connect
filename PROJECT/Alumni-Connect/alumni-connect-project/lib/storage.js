/**
 * lib/storage.js — Append-only text-file storage engine for Alumni Connect.
 *
 * No SQL, no SQLite, no npm packages: every collection is a JSON-lines log
 * plus hand-built index files that live next to it in data/.
 *
 * Layout per collection <name>:
 *   data/<name>.txt            append-only JSONL log, one record version per line
 *   data/<name>.idx            hash index: "<id>\t<byteOffset>" -> latest version
 *   data/<name>_name.idx       sorted index "sortKey\tid" (users: name)
 *   data/<name>_batch.idx      sorted index "sortKey\tid" (users: batch)
 *
 * Reads use two hand-built layers so no request re-parses a whole file:
 *   1. an in-memory snapshot per collection, invalidated by a byte-size stamp
 *   2. a lib/lru.js LRU in front of it for single-record point reads
 * Writes are append-only and serialised through a promise-based write queue,
 * which doubles as the file lock. Updates append a new version rather than
 * rewriting the file; compact() then collapses stale versions away.
 *
 * Time complexity:
 *   readOne(id)          O(1) average  (LRU -> snapshot -> idx seek)
 *   readAll()            O(n) once per change, O(1) while the log is unchanged
 *   appendRecord()       O(1) amortised write, O(log n) to re-sort the index
 *   updateRecord()       O(1) write + O(log n) index maintenance
 *   binarySearchPrefix() O(log n + k)
 *   binarySearchRange()  O(log n + k)
 *   compact()            O(n log n) (merge sort on index keys)
 *
 * Space complexity: O(n) snapshot, O(capacity) LRU, O(n) index files
 */

var fs = require('fs');
var path = require('path');
var StringDecoder = require('string_decoder').StringDecoder;

var LRU = require('./lru');
var sort = require('./sort');

// ALUMNI_DATA_DIR lets the test suite point the engine at a scratch directory
// instead of the real data/ folder.
var DATA_DIR = process.env.ALUMNI_DATA_DIR
  ? path.resolve(process.env.ALUMNI_DATA_DIR)
  : path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Collections whose sorted indexes we maintain. field -> key extractor.
var SORTED_FIELDS = {
  users: {
    name: function (r) { return String(r.name || '').toLowerCase(); },
    batch: function (r) { return padBatch(r.batch); }
  }
};

// ---- Write queue (promise-based file lock) -------------------------------
// Every mutation is chained onto this promise, so two concurrent requests can
// never interleave a read-modify-write on the same log.
var writeQueue = Promise.resolve();
var insideJob = false;

/**
 * Serialise a mutation. fn runs with the lock held; it must not call another
 * enqueueWrite, because that self-deadlocks — the inner job is chained behind
 * the outer one while the outer promise waits on the inner.
 *
 * `insideJob` is set only while a job body is actually executing, so ordinary
 * concurrent callers are queued normally and never mistaken for nesting.
 * The guard turns the nesting mistake into an immediate, obvious error.
 */
function enqueueWrite(fn) {
  if (insideJob) {
    return Promise.reject(new Error(
      'enqueueWrite was called re-entrantly. Public storage writers must not nest; use the internal appendVersion/rewriteLog helpers instead.'
    ));
  }
  var run = function () {
    insideJob = true;
    try {
      return fn();
    } finally {
      insideJob = false;
    }
  };
  writeQueue = writeQueue.then(run, run);
  return writeQueue;
}

// ---- Paths ---------------------------------------------------------------
function collPath(name) { return path.join(DATA_DIR, name + '.txt'); }
function idxPath(name) { return path.join(DATA_DIR, name + '.idx'); }
function sortedIdxPath(name, field) { return path.join(DATA_DIR, name + '_' + field + '.idx'); }

// Batch years are compared as text in the sorted index, so pad them to keep
// "2018" < "2019" ordering intact and let range scans work lexically.
function padBatch(batch) {
  var b = String(batch === undefined || batch === null ? '' : batch).trim();
  if (!b) return '9999';
  while (b.length < 4) b = '0' + b;
  return b;
}

function fileSize(p) {
  try { return fs.statSync(p).size; } catch (e) { return -1; }
}

// ---- Hash index ----------------------------------------------------------
// "<id>\t<offset>" per line. Plain object hash map when loaded.
function readIndex(name) {
  var p = idxPath(name);
  if (!fs.existsSync(p)) return null; // null = index has never been built
  var text = fs.readFileSync(p, 'utf8');
  var idx = {};
  var lines = text.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line) continue;
    var tab = line.indexOf('\t');
    if (tab === -1) continue;
    var off = parseInt(line.slice(tab + 1), 10);
    if (!isNaN(off)) idx[line.slice(0, tab)] = off;
  }
  return idx;
}

function writeIndex(name, idx) {
  var keys = Object.keys(idx);
  var lines = sort.mergeSort(keys, function (k) { return k; });
  var out = '';
  for (var i = 0; i < lines.length; i++) out += lines[i] + '\t' + idx[lines[i]] + '\n';
  writeFileAtomic(idxPath(name), out);
}

// ---- Sorted index --------------------------------------------------------
function readSortedIndex(name, field) {
  var p = sortedIdxPath(name, field);
  if (!fs.existsSync(p)) return [];
  var text = fs.readFileSync(p, 'utf8');
  var out = [];
  var lines = text.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line) continue;
    var tab = line.indexOf('\t');
    if (tab === -1) continue;
    out.push({ key: line.slice(0, tab), id: line.slice(tab + 1) });
  }
  return out;
}

function writeSortedIndex(name, field, entries) {
  var out = '';
  for (var i = 0; i < entries.length; i++) out += entries[i].key + '\t' + entries[i].id + '\n';
  writeFileAtomic(sortedIdxPath(name, field), out);
}

/**
 * Rebuild every sorted index for a collection from the live records.
 * O(n log n) — the keys go through the hand-written merge sort.
 */
function rebuildSortedIndexes(name, records) {
  var fields = SORTED_FIELDS[name];
  if (!fields) return;
  for (var field in fields) {
    if (!Object.prototype.hasOwnProperty.call(fields, field)) continue;
    var keyOf = fields[field];
    var entries = [];
    for (var i = 0; i < records.length; i++) {
      var key = keyOf(records[i]);
      if (!key) continue;
      entries.push({ key: key, id: records[i].id });
    }
    // Tie-break on id so the on-disk order is deterministic.
    entries = sort.mergeSortBy(entries, function (e) { return e.key + '\t' + e.id; });
    writeSortedIndex(name, field, entries);
  }
}

// ---- Atomic write (temp file then rename) --------------------------------
/**
 * Replace a file in one step: write a sibling temp file, then rename over the
 * target. A reader therefore never observes a half-written log.
 *
 * rename() can fail transiently with EPERM/EBUSY on Windows when a cloud-sync
 * client (OneDrive, Dropbox) briefly holds the destination open, so retry a
 * few times before giving up.
 */
function writeFileAtomic(target, contents) {
  var tmp = target + '.tmp';
  fs.writeFileSync(tmp, contents, 'utf8');

  var attempts = 5;
  for (var i = 0; i < attempts; i++) {
    try {
      fs.renameSync(tmp, target);
      return;
    } catch (e) {
      var transient = e && (e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES');
      if (!transient || i === attempts - 1) {
        try { fs.unlinkSync(tmp); } catch (e2) { /* nothing useful to do */ }
        throw e;
      }
      // Brief synchronous pause; the sync client usually releases within a few ms.
      sleepMs(10 * (i + 1));
    }
  }
}

/** Blocking sleep, used only on the rare retry path. */
function sleepMs(ms) {
  var shared = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(shared), 0, 0, ms);
}

// ---- LRU + snapshot ------------------------------------------------------
var CACHE_CAP = 500;

function getCache(name) {
  if (!caches[name]) caches[name] = new LRU(CACHE_CAP);
  return caches[name];
}

// snapshots[name] = { size, byId, order, tombstones }
// `size` is the byte size the log had when the snapshot was taken, so any
// append invalidates it without needing a checksum.
var snapshots = {};
var caches = {};

function invalidate(name) {
  delete snapshots[name];
  var c = caches[name];
  if (c) c.clear();
}

/**
 * Read one JSONL line starting at `offset`, growing the read window until the
 * newline is found. A fixed 4 KiB buffer silently truncates long records, so
 * this walks the file in chunks instead.
 */
function readLineAt(fd, offset, size) {
  var CHUNK = 8192;
  var buf = Buffer.alloc(CHUNK);
  var decoder = new StringDecoder('utf8');
  var parts = [];
  var pos = offset;
  while (pos < size) {
    var want = Math.min(CHUNK, size - pos);
    var n = fs.readSync(fd, buf, 0, want, pos);
    if (n <= 0) break;
    var text = decoder.write(buf.slice(0, n));
    var nl = text.indexOf('\n');
    if (nl !== -1) {
      parts.push(text.slice(0, nl));
      return parts.join('');
    }
    parts.push(text);
    pos += n;
  }
  parts.push(decoder.end());
  return parts.join('');
}

/**
 * Scan the log once, keeping only the newest version of each id.
 * Returns { order, byId } where order preserves first-appearance order.
 */
function scanLog(name, size) {
  var file = collPath(name);
  var order = [];
  var byId = {};
  var fd = fs.openSync(file, 'r');
  try {
    var offset = 0;
    var buf = Buffer.alloc(8192);
    var decoder = new StringDecoder('utf8');
    var carry = '';
    while (offset < size) {
      var want = Math.min(8192, size - offset);
      var n = fs.readSync(fd, buf, 0, want, offset);
      if (n <= 0) break;
      carry += decoder.write(buf.slice(0, n));
      offset += n;
      var nl;
      while ((nl = carry.indexOf('\n')) !== -1) {
        var line = carry.slice(0, nl);
        carry = carry.slice(nl + 1);
        absorbLine(name, line, byId, order);
      }
    }
    if (carry) absorbLine(name, carry, byId, order);
  } finally {
    fs.closeSync(fd);
  }
  return { order: order, byId: byId };
}

function absorbLine(name, line, byId, order) {
  if (!line) return;
  var rec;
  try { rec = JSON.parse(line); } catch (e) { return; }
  if (!rec || !rec.id) return;
  if (!Object.prototype.hasOwnProperty.call(byId, rec.id)) order.push(rec.id);
  byId[rec.id] = rec; // last version wins
}

function getSnapshot(name) {
  var size = fileSize(collPath(name));
  var snap = snapshots[name];
  if (snap && snap.size === size) return snap;
  if (size <= 0) {
    var empty = { size: size, order: [], byId: {} };
    snapshots[name] = empty;
    return empty;
  }
  var scanned = scanLog(name, size);
  scanned.size = size;
  snapshots[name] = scanned;
  return scanned;
}

// ---- Public read API -----------------------------------------------------

/**
 * All live records of a collection, newest version of each id.
 * Soft-deleted records are excluded. O(n) on the first call after a write,
 * O(1) afterwards while the log is unchanged.
 */
function readAll(name, opts) {
  var includeDeleted = opts && opts.includeDeleted;
  var snap = getSnapshot(name);
  var out = [];
  for (var i = 0; i < snap.order.length; i++) {
    var rec = snap.byId[snap.order[i]];
    if (!includeDeleted && rec._deleted) continue;
    out.push(rec);
  }
  return out;
}

/**
 * One record by id. LRU first, then the snapshot, then an .idx byte seek.
 * Returns null when absent. Soft-deleted records are still returned so callers
 * can distinguish "gone" from "never existed".
 */
function readOne(name, id) {
  if (!id) return null;
  var cache = getCache(name);
  var cached = cache.get(id);
  if (cached !== undefined) return cached;

  var snap = getSnapshot(name);
  if (Object.prototype.hasOwnProperty.call(snap.byId, id)) {
    cache.put(id, snap.byId[id]);
    return snap.byId[id];
  }

  var idx = readIndex(name);
  if (!idx || idx[id] === undefined) return null;

  var file = collPath(name);
  var size = fileSize(file);
  if (size <= 0) return null;

  var fd = fs.openSync(file, 'r');
  var line;
  try { line = readLineAt(fd, idx[id], size); } finally { fs.closeSync(fd); }
  if (!line) return null;
  var rec;
  try { rec = JSON.parse(line); } catch (e) { return null; }
  if (!rec || rec.id !== id) return null;
  cache.put(id, rec);
  return rec;
}

/** One live (non-deleted) record by id, or null. */
function readAlive(name, id) {
  var rec = readOne(name, id);
  return rec && !rec._deleted ? rec : null;
}

/** Batch read. O(k) point reads, cache-friendly when ids are near each other. */
function readMany(name, ids) {
  var out = [];
  for (var i = 0; i < ids.length; i++) {
    var rec = readAlive(name, ids[i]);
    if (rec) out.push(rec);
  }
  return out;
}

/** Count of live records. */
function count(name) {
  return readAll(name).length;
}

// ---- Public write API ----------------------------------------------------

/**
 * Append one record version and refresh its indexes.
 *
 * MUST only be called from inside enqueueWrite — it does no locking of its
 * own. Public writers compose this rather than calling each other, because a
 * public writer that calls enqueueWrite while already holding the queue
 * deadlocks: the outer promise adopts the inner one, which is chained behind
 * the outer one.
 */
function appendVersion(name, record) {
  var file = collPath(name);
  var offset = fileSize(file);
  if (offset < 0) { writeFileAtomic(file, ''); offset = 0; }

  var live = readAll(name);

  fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');

  // Extend the existing index only if it still describes this file. A stale
  // .idx (for example one left over from a rewritten log) would otherwise be
  // carried forward and extended, corrupting every later point read.
  var idx = readIndex(name);
  if (!idx || Object.keys(idx).length !== live.length) idx = scanOffsets(name);
  idx[record.id] = offset;
  writeIndex(name, idx);

  rebuildSortedIndexes(name, readAll(name));
  invalidate(name);
  return record;
}

/** Merge `patch` onto a copy of `current`. */
function mergeRecord(current, patch) {
  var merged = {};
  for (var k in current) if (Object.prototype.hasOwnProperty.call(current, k)) merged[k] = current[k];
  for (var p in patch) if (Object.prototype.hasOwnProperty.call(patch, p)) merged[p] = patch[p];
  merged.id = current.id;
  return merged;
}

/**
 * Append a new record version. O(1) write; index maintenance is O(n log n)
 * because every sorted index is re-merged from the live set.
 */
function appendRecord(name, record) {
  return enqueueWrite(function () {
    return appendVersion(name, record);
  });
}

/**
 * Append a new version of an existing record with `patch` merged in.
 * Resolves to null when the id does not exist. O(1) write.
 */
function updateRecord(name, id, patch) {
  return enqueueWrite(function () {
    var current = readOne(name, id);
    if (!current) return null;
    return appendVersion(name, mergeRecord(current, patch));
  });
}

/**
 * Soft delete: append a tombstone version. The record leaves reads immediately
 * and compact() reclaims the bytes later. O(1).
 */
function deleteRecord(name, id) {
  return enqueueWrite(function () {
    var current = readOne(name, id);
    if (!current) return false;
    appendVersion(name, mergeRecord(current, {
      _deleted: true,
      _deletedAt: new Date().toISOString()
    }));
    return true;
  });
}

/**
 * Hard delete: append a tombstone and drop every earlier version of the id.
 * O(n) because the log is rewritten, but keeps the log from growing forever.
 */
function purgeRecord(name, id) {
  return enqueueWrite(function () {
    var all = readAll(name, { includeDeleted: true });
    var kept = [];
    for (var i = 0; i < all.length; i++) if (all[i].id !== id) kept.push(all[i]);
    rewriteLog(name, kept);
    return true;
  });
}

/** Rewrite the log with exactly `records`, then rebuild every index. */
function rewriteLog(name, records) {
  var lines = [];
  for (var i = 0; i < records.length; i++) lines.push(JSON.stringify(records[i]));
  writeFileAtomic(collPath(name), lines.length ? lines.join('\n') + '\n' : '');

  var idx = {};
  var offset = 0;
  for (var j = 0; j < lines.length; j++) {
    var rec = JSON.parse(lines[j]);
    idx[rec.id] = offset;
    offset += Buffer.byteLength(lines[j] + '\n', 'utf8');
  }
  writeIndex(name, idx);
  rebuildSortedIndexes(name, records);
  invalidate(name);
}

/**
 * Compaction: collapse superseded versions and drop tombstones, then rebuild
 * the hash and sorted indexes. O(n log n). Returns a summary.
 */
function compact(name) {
  return enqueueWrite(function () {
    var versions = countVersions(name);
    var live = readAll(name);
    var keptBytes = 0;
    var bytes = fileSize(collPath(name));
    var lines = [];
    for (var i = 0; i < live.length; i++) {
      lines.push(JSON.stringify(live[i]));
      keptBytes += Buffer.byteLength(lines[i] + '\n', 'utf8');
    }
    rewriteLog(name, live);
    return {
      collection: name,
      versionsBefore: versions,
      recordsAfter: live.length,
      versionsRemoved: versions - live.length,
      bytesBefore: bytes < 0 ? 0 : bytes,
      bytesAfter: keptBytes
    };
  });
}

/** Number of lines (record versions) currently in the log. */
function countVersions(name) {
  var file = collPath(name);
  var size = fileSize(file);
  if (size <= 0) return 0;
  var text = fs.readFileSync(file, 'utf8');
  if (!text) return 0;
  var lines = text.split('\n');
  var n = 0;
  for (var i = 0; i < lines.length; i++) if (lines[i]) n++;
  return n;
}

// ---- Index bootstrap / repair -------------------------------------------

/**
 * Make sure every collection has a usable .idx plus sorted indexes.
 *
 * seed.js and migrate.js write .txt files directly, so on a fresh clone the
 * hash index does not exist yet. Without this, readOne() has no offset to seek
 * to and silently returns null. Called once at server start.
 *
 * Returns a report describing what was rebuilt.
 */
function ensureIndexes(names) {
  var report = [];
  var list = names || knownCollections();
  for (var i = 0; i < list.length; i++) {
    var name = list[i];
    var size = fileSize(collPath(name));
    if (size <= 0) continue;
    var idx = readIndex(name);
    if (!idx || !indexMatchesFile(name, idx, size)) {
      var snap = getSnapshot(name);
      var rebuilt = {};
      var offset = 0;
      var ids = sort.mergeSort(snap.order, function (k) { return k; });
      for (var j = 0; j < ids.length; j++) {
        rebuilt[ids[j]] = offset;
        offset += Buffer.byteLength(JSON.stringify(snap.byId[ids[j]]) + '\n', 'utf8');
      }
      // Offsets must reflect the real byte layout, not a re-serialised guess,
      // so verify against the file and fall back to a line scan when unsure.
      if (!offsetsResolve(name, rebuilt)) {
        rebuilt = scanOffsets(name);
      }
      writeIndex(name, rebuilt);
      report.push({ collection: name, action: 'rebuilt-hash-index', entries: Object.keys(rebuilt).length });
    }
    var fields = SORTED_FIELDS[name];
    if (fields) {
      for (var field in fields) {
        if (!Object.prototype.hasOwnProperty.call(fields, field)) continue;
        var p = sortedIdxPath(name, field);
        if (!fs.existsSync(p)) {
          rebuildSortedIndexes(name, readAll(name));
          report.push({ collection: name, action: 'rebuilt-sorted-index', field: field });
        }
      }
    }
  }
  return report;
}

/** True when the index has an entry for every id and points inside the file. */
function indexMatchesFile(name, idx, size) {
  var snap = getSnapshot(name);
  if (Object.keys(idx).length !== snap.order.length) return false;
  var ids = Object.keys(idx);
  for (var i = 0; i < ids.length; i++) {
    var off = idx[ids[i]];
    if (typeof off !== 'number' || off < 0 || off >= size) return false;
    if (!Object.prototype.hasOwnProperty.call(snap.byId, ids[i])) return false;
  }
  return true;
}

/** Spot-check that an offset really lands on that record's line. */
function offsetsResolve(name, idx) {
  var file = collPath(name);
  var size = fileSize(file);
  var ids = Object.keys(idx);
  var probe = Math.min(ids.length, 5);
  var fd = fs.openSync(file, 'r');
  try {
    for (var i = 0; i < probe; i++) {
      var id = ids[i];
      var line = readLineAt(fd, idx[id], size);
      var rec;
      try { rec = JSON.parse(line); } catch (e) { return false; }
      if (!rec || rec.id !== id) return false;
    }
  } finally {
    fs.closeSync(fd);
  }
  return true;
}

/** Ground truth: walk the file and record the offset of each id's last line. */
function scanOffsets(name) {
  var file = collPath(name);
  var size = fileSize(file);
  var idx = {};
  var fd = fs.openSync(file, 'r');
  try {
    var offset = 0;
    var buf = Buffer.alloc(8192);
    var decoder = new StringDecoder('utf8');
    var carry = '';
    var lineStart = 0;
    while (offset < size) {
      var want = Math.min(8192, size - offset);
      var n = fs.readSync(fd, buf, 0, want, offset);
      if (n <= 0) break;
      carry += decoder.write(buf.slice(0, n));
      offset += n;
      var nl;
      while ((nl = carry.indexOf('\n')) !== -1) {
        var line = carry.slice(0, nl);
        carry = carry.slice(nl + 1);
        try {
          var rec = JSON.parse(line);
          if (rec && rec.id) idx[rec.id] = lineStart;
        } catch (e) { /* skip malformed line */ }
        lineStart += Buffer.byteLength(line + '\n', 'utf8');
      }
    }
    if (carry) {
      try {
        var rec = JSON.parse(carry);
        if (rec && rec.id) idx[rec.id] = lineStart;
      } catch (e) { /* trailing partial line */ }
    }
  } finally {
    fs.closeSync(fd);
  }
  return idx;
}

// ---- Sorted-index queries (binary search) -------------------------------

/**
 * Ids whose sort key starts with `prefix`. O(log n + k).
 * Used for name-prefix lookups in the Find Alumni screen.
 */
function binarySearchPrefix(name, field, prefix) {
  var entries = readSortedIndex(name, field);
  if (!entries.length) return [];
  var lo = 0, hi = entries.length - 1;
  while (lo <= hi) {
    var mid = (lo + hi) >>> 1;
    if (entries[mid].key < prefix) lo = mid + 1;
    else hi = mid - 1;
  }
  var out = [];
  for (var i = lo; i < entries.length; i++) {
    if (entries[i].key.indexOf(prefix) === 0) out.push(entries[i].id);
    else break;
  }
  return out;
}

/**
 * Ids whose sort key falls in [from, to] inclusive. O(log n + k).
 * Used for batch-range filters, which are a range scan, not a prefix scan.
 * Reversed bounds are normalised so callers can pass a range either way round.
 */
function binarySearchRange(name, field, from, to) {
  var entries = readSortedIndex(name, field);
  if (!entries.length) return [];
  if (from > to) { var swap = from; from = to; to = swap; }
  var lo = lowerBound(entries, from);
  var out = [];
  for (var i = lo; i < entries.length; i++) {
    if (entries[i].key > to) break;
    out.push(entries[i].id);
  }
  return out;
}

/** First position with key >= target. O(log n) */
function lowerBound(entries, target) {
  var lo = 0, hi = entries.length - 1, ans = entries.length;
  while (lo <= hi) {
    var mid = (lo + hi) >>> 1;
    if (entries[mid].key < target) lo = mid + 1;
    else { ans = mid; hi = mid - 1; }
  }
  return ans;
}

/** Exact key lookup. O(log n) */
function binarySearchExact(name, field, key) {
  var entries = readSortedIndex(name, field);
  var lo = 0, hi = entries.length - 1;
  while (lo <= hi) {
    var mid = (lo + hi) >>> 1;
    if (entries[mid].key === key) return entries[mid].id;
    if (entries[mid].key < key) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

// ---- Archival (Huffman) --------------------------------------------------

/**
 * Move records older than maxAgeMs into data/archive/<name>.txt.huff with
 * Huffman coding and rewrite the live log without them. Returns bytes freed.
 */
function archiveOldLogs(name, maxAgeMs) {
  return enqueueWrite(function () {
    var file = collPath(name);
    var size = fileSize(file);
    if (size <= 0) return 0;

    var archiveDir = path.join(DATA_DIR, 'archive');
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });

    var all = readAll(name, { includeDeleted: true });
    var now = Date.now();
    var kept = [], archived = [];
    for (var i = 0; i < all.length; i++) {
      var stamp = new Date(all[i].createdAt || 0).getTime();
      if (stamp && now - stamp > maxAgeMs) archived.push(all[i]);
      else kept.push(all[i]);
    }
    if (!archived.length) return 0;

    var huffman = require('./huffman');
    var payload = archived.map(function (r) { return JSON.stringify(r); }).join('\n');
    var compressed = huffman.compress(payload);
    fs.writeFileSync(path.join(archiveDir, name + '.txt.huff'), JSON.stringify(compressed), 'utf8');

    var before = size;
    rewriteLog(name, kept);
    invalidate(name);
    return before - fileSize(file);
  });
}

/**
 * Decompress data/archive/<name>.txt.huff back into the live log.
 * Returns the number of records restored.
 */
function restoreFromArchive(name) {
  return enqueueWrite(function () {
    var archivePath = path.join(DATA_DIR, 'archive', name + '.txt.huff');
    if (!fs.existsSync(archivePath)) return 0;

    var huffman = require('./huffman');
    var compressed = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
    var text = huffman.decompress(compressed);

    var restored = [];
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      try {
        var rec = JSON.parse(lines[i]);
        if (rec && rec.id) restored.push(rec);
      } catch (e) { /* skip */ }
    }

    var live = readAll(name, { includeDeleted: true });
    var merged = live.concat(restored);
    rewriteLog(name, merged);
    fs.unlinkSync(archivePath);
    return restored.length;
  });
}

// ---- Introspection -------------------------------------------------------

/** Collections that currently have a .txt file. */
function knownCollections() {
  var names = [];
  var entries = fs.readdirSync(DATA_DIR);
  for (var i = 0; i < entries.length; i++) {
    if (/\.txt$/.test(entries[i])) names.push(entries[i].replace(/\.txt$/, ''));
  }
  return sort.mergeSort(names, function (n) { return n; });
}

/** Per-collection stats for the admin/health view. */
function stats(name) {
  var size = fileSize(collPath(name));
  return {
    collection: name,
    bytes: size < 0 ? 0 : size,
    versions: countVersions(name),
    records: readAll(name).length,
    cached: caches[name] ? caches[name].size : 0
  };
}

module.exports = {
  DATA_DIR: DATA_DIR,

  appendRecord: appendRecord,
  readOne: readOne,
  readAlive: readAlive,
  readAll: readAll,
  readMany: readMany,
  count: count,
  updateRecord: updateRecord,
  deleteRecord: deleteRecord,
  purgeRecord: purgeRecord,
  compact: compact,
  countVersions: countVersions,

  archiveOldLogs: archiveOldLogs,
  restoreFromArchive: restoreFromArchive,

  binarySearchPrefix: binarySearchPrefix,
  binarySearchRange: binarySearchRange,
  binarySearchExact: binarySearchExact,
  readSortedIndex: readSortedIndex,

  ensureIndexes: ensureIndexes,
  knownCollections: knownCollections,
  stats: stats,
  enqueueWrite: enqueueWrite,

  collPath: collPath,
  idxPath: idxPath,
  sortedIdxPath: sortedIdxPath,
  writeFileAtomic: writeFileAtomic,

  _invalidate: invalidate,
  _clearCaches: function () { snapshots = {}; caches = {}; }
};