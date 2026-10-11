/**
 * tests/storage.test.js — lib/storage.js
 *
 * Runs against tests/.scratch-data because run.js sets ALUMNI_DATA_DIR before
 * loading this file.
 */

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var storage = require('../lib/storage');

var COLL = 'unit';

function fresh(records) {
  var file = storage.collPath(COLL);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  var idx = storage.idxPath(COLL);
  if (fs.existsSync(idx)) fs.unlinkSync(idx);
  storage._clearCaches();
  return records;
}

/** Seed the generic collection used by most tests. */
function seed(n) {
  fresh();
  var chain = Promise.resolve();
  for (var i = 0; i < n; i++) {
    (function (i) {
      chain = chain.then(function () {
        return storage.appendRecord(COLL, {
          id: 'R' + i,
          name: 'Name ' + String(100 + i),
          batch: String(2015 + (i % 8)),
          email: 'user' + i + '@test.local',
          v: 0
        });
      });
    })(i);
  }
  return chain;
}

/**
 * Seed the 'users' collection, which is the only one the engine maintains
 * sorted indexes for (by name and by batch).
 */
function seedUsers(n) {
  var file = storage.collPath('users');
  if (fs.existsSync(file)) fs.unlinkSync(file);
  // The hash index must go too: leaving offsets from a previous log behind
  // would point them at the wrong lines.
  if (fs.existsSync(storage.idxPath('users'))) fs.unlinkSync(storage.idxPath('users'));
  ['name', 'batch'].forEach(function (field) {
    var p = storage.sortedIdxPath('users', field);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
  storage._clearCaches();

  var chain = Promise.resolve();
  for (var i = 0; i < n; i++) {
    (function (i) {
      chain = chain.then(function () {
        return storage.appendRecord('users', {
          id: 'R' + i,
          name: 'Name ' + String(100 + i),
          batch: String(2015 + (i % 8)),
          role: 'alumni'
        });
      });
    })(i);
  }
  return chain.then(function () { return storage.ensureIndexes(['users']); });
}

describe('lib/storage.js', function () {

  // ---- append + read ----
  it('appends a record and reads it back', function () {
    fresh();
    return storage.appendRecord(COLL, { id: 'A1', name: 'Alpha', v: 1 }).then(function () {
      var rec = storage.readOne(COLL, 'A1');
      assert.ok(rec);
      assert.strictEqual(rec.name, 'Alpha');
    });
  });

  it('readAll returns every live record', function () {
    return seed(12).then(function () {
      assert.strictEqual(storage.readAll(COLL).length, 12);
      assert.strictEqual(storage.count(COLL), 12);
    });
  });

  it('readOne returns null for an unknown id', function () {
    return seed(3).then(function () {
      assert.strictEqual(storage.readOne(COLL, 'missing'), null);
      assert.strictEqual(storage.readOne(COLL, null), null);
    });
  });

  it('readOne reads records larger than a 4 KiB buffer', function () {
    fresh();
    var big = new Array(20000).join('y'); // ~20 KB, far past the old 4096 limit
    return storage.appendRecord(COLL, { id: 'BIG', blob: big }).then(function () {
      storage._clearCaches(); // force a cold read through the .idx byte seek
      var rec = storage.readOne(COLL, 'BIG');
      assert.strictEqual(rec.blob.length, big.length);
    });
  });

  it('reuses the snapshot instead of re-reading the file when nothing changed', function () {
    return seed(5).then(function () {
      var a = storage.readAll(COLL);
      var b = storage.readAll(COLL);
      // Same object identity proves the snapshot was reused.
      assert.strictEqual(a[0], b[0]);
    });
  });

  // ---- updates ----
  it('updateRecord merges a patch and keeps a single live version', function () {
    return seed(4).then(function () {
      return storage.updateRecord(COLL, 'R1', { v: 7 });
    }).then(function (updated) {
      assert.strictEqual(updated.v, 7);
      assert.strictEqual(storage.readOne(COLL, 'R1').v, 7);
      assert.strictEqual(storage.readAll(COLL).length, 4, 'update must not duplicate the record');
    });
  });

  it('updateRecord returns null for an unknown id', function () {
    return seed(2).then(function () {
      return storage.updateRecord(COLL, 'nope', { v: 1 });
    }).then(function (res) {
      assert.strictEqual(res, null);
    });
  });

  it('the newest version wins when the same id is appended twice', function () {
    fresh();
    return storage.appendRecord(COLL, { id: 'D', v: 1 })
      .then(function () { return storage.appendRecord(COLL, { id: 'D', v: 2 }); })
      .then(function () {
        var all = storage.readAll(COLL);
        assert.strictEqual(all.length, 1, 'last version wins');
        assert.strictEqual(all[0].v, 2);
        assert.strictEqual(storage.readOne(COLL, 'D').v, 2);
        assert.strictEqual(storage.countVersions(COLL), 2, 'both versions remain on disk');
      });
  });

  // ---- deletes + compaction ----
  it('deleteRecord hides the record from reads', function () {
    return seed(6).then(function () {
      return storage.deleteRecord(COLL, 'R2');
    }).then(function () {
      assert.strictEqual(storage.readAll(COLL).length, 5);
      assert.strictEqual(storage.readAlive(COLL, 'R2'), null);
      assert.ok(storage.readOne(COLL, 'R2'), 'the tombstone is still readable by id');
    });
  });

  it('purgeRecord removes every version of an id', function () {
    return seed(5).then(function () {
      return storage.purgeRecord(COLL, 'R3');
    }).then(function () {
      assert.strictEqual(storage.readOne(COLL, 'R3'), null);
      assert.strictEqual(storage.countVersions(COLL), 4);
    });
  });

  it('compact drops superseded versions and tombstones', function () {
    return seed(8).then(function () {
      return storage.updateRecord(COLL, 'R0', { v: 99 });
    }).then(function () {
      return storage.deleteRecord(COLL, 'R7');
    }).then(function () {
      var before = storage.countVersions(COLL);
      return storage.compact(COLL);
    }).then(function (report) {
      assert.ok(report.versionsRemoved > 0, 'expected stale versions to be removed');
      assert.strictEqual(storage.countVersions(COLL), storage.readAll(COLL).length);
      assert.strictEqual(storage.readAll(COLL).length, 7, 'one record was soft-deleted');
      assert.strictEqual(storage.readOne(COLL, 'R0').v, 99, 'surviving update is preserved');
      assert.ok(report.bytesAfter <= report.bytesBefore);
    });
  });

  // ---- write queue ----
  it('serialises concurrent writes without losing any record', function () {
    fresh();
    var jobs = [];
    for (var i = 0; i < 40; i++) {
      (function (i) {
        jobs.push(storage.appendRecord(COLL, { id: 'C' + i, n: i }));
      })(i);
    }
    return Promise.all(jobs).then(function () {
      var all = storage.readAll(COLL);
      assert.strictEqual(all.length, 40, 'every concurrent append must land');
      var ids = {};
      for (var j = 0; j < all.length; j++) ids[all[j].id] = true;
      for (var k = 0; k < 40; k++) assert.ok(ids['C' + k], 'missing C' + k);
    });
  });

  it('rejects a re-entrant enqueueWrite instead of deadlocking', function () {
    return storage.enqueueWrite(function () {
      return storage.enqueueWrite(function () { return 1; });
    }).then(function () {
      throw new Error('expected the nested write to be rejected');
    }, function (e) {
      assert.ok(/re-entrant/i.test(e.message), e.message);
    });
  });

  // ---- indexes ----
  it('builds a hash index that resolves ids to correct offsets', function () {
    return seed(10).then(function () {
      // Drop the in-memory layers so readOne must use the .idx on disk.
      storage._clearCaches();
      for (var i = 0; i < 10; i++) {
        var rec = storage.readOne(COLL, 'R' + i);
        assert.ok(rec, 'R' + i + ' should resolve through the index');
        assert.strictEqual(rec.email, 'user' + i + '@test.local');
      }
    });
  });

  it('ensureIndexes rebuilds a deleted .idx', function () {
    return seed(6).then(function () {
      fs.unlinkSync(storage.idxPath(COLL));
      storage._clearCaches();
      var report = storage.ensureIndexes([COLL]);
      assert.ok(report.length > 0, 'expected a rebuild report entry');
      storage._clearCaches();
      assert.ok(storage.readOne(COLL, 'R0'), 'readOne works again after rebuild');
    });
  });

  it('binarySearchPrefix finds name prefixes', function () {
    return seedUsers(30).then(function () {
      var ids = storage.binarySearchPrefix('users', 'name', 'name 10');
      assert.ok(ids.length > 0, 'expected prefix hits');
      var recs = storage.readMany('users', ids);
      for (var i = 0; i < recs.length; i++) {
        assert.strictEqual(recs[i].name.toLowerCase().indexOf('name 10'), 0);
      }
    });
  });

  it('binarySearchRange returns only ids inside the batch window', function () {
    return seedUsers(40).then(function () {
      var ids = storage.binarySearchRange('users', 'batch', '2016', '2018');
      assert.ok(ids.length > 0);
      var recs = storage.readMany('users', ids);
      for (var i = 0; i < recs.length; i++) {
        var y = parseInt(recs[i].batch, 10);
        assert.ok(y >= 2016 && y <= 2018, 'batch ' + recs[i].batch + ' out of range');
      }
    });
  });

  it('binarySearchRange handles an inverted range by normalising it', function () {
    return seedUsers(40).then(function () {
      var wide = storage.binarySearchRange('users', 'batch', '2015', '2022');
      var inverted = storage.binarySearchRange('users', 'batch', '2022', '2015');
      assert.deepStrictEqual(inverted, wide);
    });
  });

  it('binarySearchExact finds a single key', function () {
    return seedUsers(3).then(function () {
      var id = storage.binarySearchExact('users', 'batch', '2015');
      assert.ok(id, 'expected a hit for batch 2015');
      assert.strictEqual(storage.readOne('users', id).batch, '2015');
      assert.strictEqual(storage.binarySearchExact('users', 'batch', '1999'), null);
    });
  });

  // ---- atomic writes + archival ----
  it('leaves no .tmp file behind after a write', function () {
    return seed(4).then(function () {
      assert.strictEqual(fs.existsSync(storage.collPath(COLL) + '.tmp'), false);
      assert.strictEqual(fs.existsSync(storage.idxPath(COLL) + '.tmp'), false);
    });
  });

  it('archives old records with Huffman and restores them', function () {
    fresh();
    var old = { id: 'OLD', createdAt: '2020-01-01T00:00:00.000Z', note: 'stale record' };
    var recent = { id: 'NEW', createdAt: new Date().toISOString(), note: 'keep me' };
    return storage.appendRecord(COLL, old)
      .then(function () { return storage.appendRecord(COLL, recent); })
      .then(function () { return storage.archiveOldLogs(COLL, 30 * 86400000); })
      .then(function (freed) {
        assert.ok(freed > 0, 'archiving should free bytes');
        var after = storage.readAll(COLL);
        assert.strictEqual(after.length, 1);
        assert.strictEqual(after[0].id, 'NEW');
        return storage.restoreFromArchive(COLL);
      })
      .then(function (restored) {
        assert.strictEqual(restored, 1);
        var ids = storage.readAll(COLL).map(function (r) { return r.id; });
        assert.ok(ids.indexOf('OLD') !== -1, 'archived record came back');
        assert.ok(ids.indexOf('NEW') !== -1, 'live record survived');
      });
  });

  it('reports stats for a collection', function () {
    return seed(5).then(function () {
      var s = storage.stats(COLL);
      assert.strictEqual(s.collection, COLL);
      assert.strictEqual(s.records, 5);
      assert.strictEqual(s.versions, 5);
      assert.ok(s.bytes > 0);
    });
  });

  it('lists collections that have a log file', function () {
    return seed(2).then(function () {
      assert.ok(storage.knownCollections().indexOf(COLL) !== -1);
    });
  });

  void path;
});