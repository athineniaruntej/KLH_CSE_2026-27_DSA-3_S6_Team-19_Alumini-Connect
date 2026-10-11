/**
 * lib/lru.js — Hand-built LRU Cache using a plain hash map + doubly linked list.
 *
 * Time complexity:  get -> O(1), put -> O(1), delete -> O(1)
 * Space complexity: O(capacity)
 *
 * Constraints: plain objects (no Map/Set used as the primary structure).
 */

function createNode(key, value) {
  return { key, value, prev: null, next: null };
}

function LRUCache(capacity) {
  this.cap = capacity;
  this.size = 0;
  this.map = {};           // key -> node (plain object hash map)
  this.head = createNode(null, null); // sentinel head (most recent)
  this.tail = createNode(null, null); // sentinel tail (least recent)
  this.head.next = this.tail;
  this.tail.prev = this.head;
}

// Remove a node from the linked list. O(1)
LRUCache.prototype._remove = function (node) {
  node.prev.next = node.next;
  node.next.prev = node.prev;
  node.prev = null;
  node.next = null;
};

// Insert node right after head (most recent). O(1)
LRUCache.prototype._addFront = function (node) {
  node.next = this.head.next;
  node.prev = this.head;
  this.head.next.prev = node;
  this.head.next = node;
};

// Get value by key. Returns undefined if missing. O(1)
LRUCache.prototype.get = function (key) {
  var node = this.map[key];
  if (!node) return undefined;
  this._remove(node);
  this._addFront(node);
  return node.value;
};

// Put key-value pair. Evicts LRU entry if over capacity. O(1)
LRUCache.prototype.put = function (key, value) {
  var node = this.map[key];
  if (node) {
    node.value = value;
    this._remove(node);
    this._addFront(node);
    return;
  }
  var newNode = createNode(key, value);
  this.map[key] = newNode;
  this._addFront(newNode);
  this.size++;
  if (this.size > this.cap) {
    var lru = this.tail.prev;
    this._remove(lru);
    delete this.map[lru.key];
    this.size--;
  }
};

// Delete a key. Returns true if found. O(1)
LRUCache.prototype.delete = function (key) {
  var node = this.map[key];
  if (!node) return false;
  this._remove(node);
  delete this.map[key];
  this.size--;
  return true;
};

// Return all values in MRU..LRU order. O(n)
LRUCache.prototype.entries = function () {
  var out = [];
  var cur = this.head.next;
  while (cur !== this.tail) {
    out.push({ key: cur.key, value: cur.value });
    cur = cur.next;
  }
  return out;
};

// Clear the cache. O(1)
LRUCache.prototype.clear = function () {
  this.map = {};
  this.size = 0;
  this.head.next = this.tail;
  this.tail.prev = this.head;
};

module.exports = LRUCache;
