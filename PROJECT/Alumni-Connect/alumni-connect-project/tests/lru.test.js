/**
 * tests/lru.test.js — lib/lru.js (hand-built hash map + doubly linked list)
 */

var LRU = require('../lib/lru');

describe('lib/lru.js', function () {

  it('stores and retrieves a value', function () {
    var c = new LRU(3);
    c.put('a', 1);
    assert.strictEqual(c.get('a'), 1);
  });

  it('returns undefined for a missing key', function () {
    var c = new LRU(3);
    assert.strictEqual(c.get('nope'), undefined);
  });

  it('evicts the least recently used entry at capacity', function () {
    var c = new LRU(2);
    c.put('a', 1);
    c.put('b', 2);
    c.put('c', 3); // 'a' is now the oldest
    assert.strictEqual(c.get('a'), undefined);
    assert.strictEqual(c.get('b'), 2);
    assert.strictEqual(c.get('c'), 3);
    assert.strictEqual(c.size, 2);
  });

  it('promotes on read, so a get protects the entry from eviction', function () {
    var c = new LRU(2);
    c.put('a', 1);
    c.put('b', 2);
    c.get('a');          // 'a' becomes most recent, so 'b' is now LRU
    c.put('c', 3);
    assert.strictEqual(c.get('a'), 1);
    assert.strictEqual(c.get('b'), undefined);
  });

  it('updates in place without growing the size', function () {
    var c = new LRU(2);
    c.put('a', 1);
    c.put('a', 99);
    assert.strictEqual(c.size, 1);
    assert.strictEqual(c.get('a'), 99);
  });

  it('deletes a key and reports whether it existed', function () {
    var c = new LRU(2);
    c.put('a', 1);
    assert.strictEqual(c.delete('a'), true);
    assert.strictEqual(c.delete('a'), false);
    assert.strictEqual(c.size, 0);
  });

  it('entries() returns most-recent first', function () {
    var c = new LRU(3);
    c.put('a', 1);
    c.put('b', 2);
    c.put('c', 3);
    assert.deepStrictEqual(c.entries().map(function (e) { return e.key; }), ['c', 'b', 'a']);
  });

  it('clear() empties the cache but keeps it usable', function () {
    var c = new LRU(2);
    c.put('a', 1);
    c.clear();
    assert.strictEqual(c.size, 0);
    assert.strictEqual(c.get('a'), undefined);
    c.put('z', 26);
    assert.strictEqual(c.get('z'), 26);
  });

  it('survives churn without corrupting the linked list', function () {
    var c = new LRU(5);
    for (var i = 0; i < 200; i++) c.put('k' + i, i);
    assert.strictEqual(c.size, 5);
    // The five most recent keys must survive.
    for (var j = 195; j < 200; j++) assert.strictEqual(c.get('k' + j), j);
    // Walking the whole list must terminate and have exactly `size` nodes.
    assert.strictEqual(c.entries().length, 5);
  });

});