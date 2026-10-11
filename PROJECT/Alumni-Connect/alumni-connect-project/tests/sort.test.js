/**
 * tests/sort.test.js — lib/sort.js (hand-written merge sort, bounded max-heap)
 */

var sort = require('../lib/sort');

function isSorted(list) {
  for (var i = 1; i < list.length; i++) if (list[i - 1] > list[i]) return false;
  return true;
}

describe('lib/sort.js', function () {

  it('sorts an unsorted list', function () {
    assert.deepStrictEqual(sort.mergeSort([5, 3, 9, 1, 7]), [1, 3, 5, 7, 9]);
  });

  it('handles empty, single and already-sorted input', function () {
    assert.deepStrictEqual(sort.mergeSort([]), []);
    assert.deepStrictEqual(sort.mergeSort([42]), [42]);
    assert.deepStrictEqual(sort.mergeSort([1, 2, 3]), [1, 2, 3]);
  });

  it('sorts descending input', function () {
    assert.deepStrictEqual(sort.mergeSort([9, 7, 5, 3, 1]), [1, 3, 5, 7, 9]);
  });

  it('mergeSortBy sorts by a key extractor', function () {
    var rows = [
      { name: 'c', n: 3 },
      { name: 'a', n: 1 },
      { name: 'b', n: 2 }
    ];
    assert.deepStrictEqual(
      sort.mergeSortBy(rows, function (r) { return r.name; }).map(function (r) { return r.n; }),
      [1, 2, 3]
    );
  });

  it('mergeSortBy is stable for equal keys', function () {
    var rows = [
      { k: 'x', seq: 0 },
      { k: 'x', seq: 1 },
      { k: 'x', seq: 2 }
    ];
    var out = sort.mergeSortBy(rows, function (r) { return r.k; });
    assert.deepStrictEqual(out.map(function (r) { return r.seq; }), [0, 1, 2]);
  });

  it('sorts a large random list correctly', function () {
    var list = [];
    for (var i = 0; i < 500; i++) list.push(Math.floor(Math.random() * 5000));
    var out = sort.mergeSort(list);
    assert.strictEqual(out.length, list.length);
    assert.ok(isSorted(out));
    // Same multiset in, same multiset out.
    assert.deepStrictEqual(out.slice().sort(function (a, b) { return a - b; }),
      list.slice().sort(function (a, b) { return a - b; }));
  });

  it('topK returns the k highest-scoring items, descending', function () {
    var rows = [{ s: 1 }, { s: 9 }, { s: 5 }, { s: 7 }, { s: 3 }];
    var top = sort.topK(rows, 2, function (r) { return r.s; });
    assert.deepStrictEqual(top.map(function (r) { return r.s; }), [9, 7]);
  });

  it('topK returns everything when k exceeds the list length', function () {
    var rows = [{ s: 2 }, { s: 4 }];
    var top = sort.topK(rows, 10, function (r) { return r.s; });
    assert.deepStrictEqual(top.map(function (r) { return r.s; }), [4, 2]);
  });

  it('topK handles k <= 0 and empty input', function () {
    assert.deepStrictEqual(sort.topK([{ s: 1 }], 0, function (r) { return r.s; }), []);
    assert.deepStrictEqual(sort.topK([], 3, function (r) { return r.s; }), []);
  });

  it('topK matches a full sort of the same data', function () {
    // Distinct scores: with ties, which of two equal-scoring items lands in the
    // top-k is genuinely ambiguous (a stable sort keeps the last after reverse,
    // a heap keeps the first seen), so the comparison would be meaningless.
    var scores = [];
    for (var i = 0; i < 300; i++) scores.push(i);
    for (var s = scores.length - 1; s > 0; s--) {
      var j = Math.floor(Math.random() * (s + 1));
      var t = scores[s]; scores[s] = scores[j]; scores[j] = t;
    }

    var rows = scores.map(function (sc, idx) { return { id: idx, s: sc }; });
    var expected = sort.mergeSortBy(rows, function (r) { return r.s; }).reverse().slice(0, 10);
    var actual = sort.topK(rows, 10, function (r) { return r.s; });

    assert.deepStrictEqual(actual.map(function (r) { return r.id; }),
      expected.map(function (r) { return r.id; }));

    var desc = true;
    for (var k = 1; k < actual.length; k++) if (actual[k - 1].s < actual[k].s) desc = false;
    assert.ok(desc, 'topK must return descending scores');
  });

  it('MaxHeap drains in descending order', function () {
    var h = new sort.MaxHeap(function (e) { return e.score; });
    [4, 1, 9, 7, 3].forEach(function (s) { h.push({ score: s }); });
    assert.strictEqual(h.size(), 5);
    assert.strictEqual(h.peek().score, 9);
    assert.deepStrictEqual(h.drainDescending().map(function (e) { return e.score; }), [9, 7, 4, 3, 1]);
    assert.strictEqual(h.size(), 0);
  });

  it('MaxHeap replaceTop swaps in a smaller root and re-sinks', function () {
    var h = new sort.MaxHeap(function (e) { return e.score; });
    [10, 8, 6].forEach(function (s) { h.push({ score: s }); });
    h.replaceTop({ score: 1 });
    assert.deepStrictEqual(h.drainDescending().map(function (e) { return e.score; }), [8, 6, 1]);
  });

});