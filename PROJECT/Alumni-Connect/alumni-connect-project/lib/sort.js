/**
 * lib/sort.js — Hand-written stable merge sort + top-K selection.
 *
 * Constraint: the core structures must not use the built-in Array#sort,
 * so every ordered index and ranked result list in this project is built
 * with this module.
 *
 * Time complexity:
 *   mergeSort(list)        O(n log n)
 *   mergeSortBy(list, fn)  O(n log n) (stable)
 *   topK(list, k, fn)     O(n log k) time, O(k) space
 *
 * Space complexity:
 *   mergeSort(list)        O(n) auxiliary buffer
 *   topK(list, k, fn)      O(k) auxiliary buffer
 */

/**
 * Compare helper. Returns <0 when a sorts before b, >0 when after, 0 when equal.
 * String comparison is byte-wise so index keys sort identically to how they
 * are written to disk (important for the binary searches in lib/storage.js).
 */
function cmp(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Merge two already-sorted runs into one sorted run. O(n + m)
 */
function merge(left, right) {
  var out = [];
  var i = 0, j = 0;
  while (i < left.length && j < right.length) {
    // "<=" keeps equal elements in their original order, which makes the
    // sort stable.
    if (cmp(left[i], right[j]) <= 0) out.push(left[i++]);
    else out.push(right[j++]);
  }
  while (i < left.length) out.push(left[i++]);
  while (j < right.length) out.push(right[j++]);
  return out;
}

/**
 * Bottom-up merge sort over plain arrays. O(n log n) time, O(n) space.
 */
function mergeSort(list) {
  if (!list || list.length < 2) return (list || []).slice();
  var width = 1;
  var runs = [];
  for (var i = 0; i < list.length; i += width) runs.push(list.slice(i, i + width));
  while (runs.length > 1) {
    var next = [];
    for (var r = 0; r < runs.length; r += 2) {
      if (r + 1 >= runs.length) next.push(runs[r]);
      else next.push(merge(runs[r], runs[r + 1]));
    }
    runs = next;
    width *= 2;
  }
  return runs[0] || [];
}

/**
 * Bottom-up merge sort with a key extractor. O(n log n), stable.
 * `keyFn` maps an item to the value used for ordering.
 */
function mergeSortBy(list, keyFn) {
  if (!list || list.length < 2) return (list || []).slice();
  var width = 1;
  var runs = [];
  for (var i = 0; i < list.length; i += width) runs.push(list.slice(i, i + width));
  while (runs.length > 1) {
    var next = [];
    for (var r = 0; r < runs.length; r += 2) {
      if (r + 1 >= runs.length) next.push(runs[r]);
      else next.push(mergeByKey(runs[r], runs[r + 1], keyFn));
    }
    runs = next;
    width *= 2;
  }
  return runs[0] || [];
}

/**
 * Merge two runs already sorted by `keyFn`. O(n + m)
 */
function mergeByKey(left, right, keyFn) {
  var out = [];
  var i = 0, j = 0;
  while (i < left.length && j < right.length) {
    if (cmp(keyFn(left[i]), keyFn(right[j])) <= 0) out.push(left[i++]);
    else out.push(right[j++]);
  }
  while (i < left.length) out.push(left[i++]);
  while (j < right.length) out.push(right[j++]);
  return out;
}

/**
 * Top-K largest items by `scoreFn`, returned in descending score order.
 *
 * Uses a hand-written bounded min-heap of size k instead of sorting the whole
 * list, so a search over n candidates with a small k stays O(n log k). The
 * root of a min-heap is the weakest of the k items held so far, which is
 * exactly the one to evict when a better candidate arrives.
 *
 * Time complexity:  O(n log k)
 * Space complexity: O(k)
 */
function topK(list, k, scoreFn) {
  if (k <= 0 || !list || !list.length) return [];
  // The heap stores { item, score } entries, and its default comparator reads
  // entry.score, so scoreFn is applied here rather than inside the heap.
  var heap = new MinHeap();

  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    var score = scoreFn(item);
    if (heap.size() < k) {
      heap.push({ item: item, score: score });
    } else if (score > heap.peek().score) {
      heap.replaceTop({ item: item, score: score });
    }
  }

  // Draining a min-heap yields ascending; reverse for descending order.
  var kept = heap.drainAscending();
  var out = [];
  for (var j = kept.length - 1; j >= 0; j--) out.push(kept[j].item);
  return out;
}

/** Shared binary-heap mechanics for the min- and max-heap variants. */
function heapBase(scoreOf) {
  this.a = [];
  this.scoreOf = scoreOf || function (e) { return e.score; };
}

heapBase.prototype.size = function () { return this.a.length; };
heapBase.prototype._scoreAt = function (i) { return this.scoreOf(this.a[i]); };
heapBase.prototype._swap = function (i, j) {
  var t = this.a[i]; this.a[i] = this.a[j]; this.a[j] = t;
};
heapBase.prototype.push = function (entry) {
  this.a.push(entry);
  this._up(this.a.length - 1);
};
heapBase.prototype.peek = function () { return this.a[0]; };
heapBase.prototype.replaceTop = function (entry) {
  this.a[0] = entry;
  this._down(0);
};

/**
 * Hand-written binary max-heap backed by a plain array. No library heap used.
 */
function MaxHeap(scoreOf) {
  heapBase.call(this, scoreOf);
}
MaxHeap.prototype = Object.create(heapBase.prototype);
MaxHeap.prototype._up = function (i) {
  while (i > 0) {
    var p = (i - 1) >>> 1;
    if (this._scoreAt(p) >= this._scoreAt(i)) break;
    this._swap(p, i);
    i = p;
  }
};
MaxHeap.prototype._down = function (i) {
  var n = this.a.length;
  while (true) {
    var s = i, l = 2 * i + 1, r = 2 * i + 2;
    if (l < n && this._scoreAt(l) > this._scoreAt(s)) s = l;
    if (r < n && this._scoreAt(r) > this._scoreAt(s)) s = r;
    if (s === i) break;
    this._swap(i, s);
    i = s;
  }
};
/** Repeatedly pop the max, producing a descending list. O(k log k) */
MaxHeap.prototype.drainDescending = function () {
  var out = [];
  while (this.a.length) {
    out.push(this.a[0]);
    var last = this.a.pop();
    if (this.a.length) {
      this.a[0] = last;
      this._down(0);
    }
  }
  return out;
};

/** Hand-written binary min-heap backed by a plain array. */
function MinHeap(scoreOf) {
  heapBase.call(this, scoreOf);
}
MinHeap.prototype = Object.create(heapBase.prototype);
MinHeap.prototype._up = function (i) {
  while (i > 0) {
    var p = (i - 1) >>> 1;
    if (this._scoreAt(p) <= this._scoreAt(i)) break;
    this._swap(p, i);
    i = p;
  }
};
MinHeap.prototype._down = function (i) {
  var n = this.a.length;
  while (true) {
    var s = i, l = 2 * i + 1, r = 2 * i + 2;
    if (l < n && this._scoreAt(l) < this._scoreAt(s)) s = l;
    if (r < n && this._scoreAt(r) < this._scoreAt(s)) s = r;
    if (s === i) break;
    this._swap(i, s);
    i = s;
  }
};
/** Repeatedly pop the min, producing an ascending list. O(k log k) */
MinHeap.prototype.drainAscending = function () {
  var out = [];
  while (this.a.length) {
    out.push(this.a[0]);
    var last = this.a.pop();
    if (this.a.length) {
      this.a[0] = last;
      this._down(0);
    }
  }
  return out;
};

module.exports = {
  mergeSort: mergeSort,
  mergeSortBy: mergeSortBy,
  merge: merge,
  topK: topK,
  MaxHeap: MaxHeap,
  MinHeap: MinHeap
};