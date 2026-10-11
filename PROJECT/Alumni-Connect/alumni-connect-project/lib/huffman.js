/**
 * lib/huffman.js — Huffman coding for compressing archived logs.
 *
 * Builds a Huffman tree from byte frequencies, encodes text to a binary string,
 * and decodes back. Uses a plain-array min-heap (no built-in sort / no library).
 *
 * Time complexity:  buildTree -> O(n log n) where n = unique bytes
 *                   encode -> O(m) where m = text length
 *                   decode -> O(m)
 * Space complexity: O(n) for tree + O(m) for encoded output
 */

function MinHeap() { this.a = []; }
MinHeap.prototype._swap = function (i, j) { var t = this.a[i]; this.a[i] = this.a[j]; this.a[j] = t; };
MinHeap.prototype._up = function (i) { while (i > 0) { var p = (i - 1) >>> 1; if (this.a[p].f <= this.a[i].f) break; this._swap(p, i); i = p; } };
MinHeap.prototype._down = function (i) { var n = this.a.length; while (true) { var s = i, l = 2 * i + 1, r = 2 * i + 2; if (l < n && this.a[l].f < this.a[s].f) s = l; if (r < n && this.a[r].f < this.a[s].f) s = r; if (s === i) break; this._swap(i, s); i = s; } };
MinHeap.prototype.push = function (x) { this.a.push(x); this._up(this.a.length - 1); };
MinHeap.prototype.pop = function () { if (!this.a.length) return null; if (this.a.length === 1) return this.a.pop(); var r = this.a[0]; this.a[0] = this.a.pop(); this._down(0); return r; };
MinHeap.prototype.size = function () { return this.a.length; };

// Build frequency table from a string. O(m)
function freqTable(str) {
  var f = {};
  for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); f[c] = (f[c] || 0) + 1; }
  return f;
}

// Build Huffman tree. Returns root node. O(n log n)
function buildTree(frequencies) {
  var heap = new MinHeap();
  var keys = Object.keys(frequencies);
  if (keys.length === 0) return null;
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    heap.push({ f: frequencies[k], ch: k, left: null, right: null });
  }
  while (heap.size() > 1) {
    var a = heap.pop(), b = heap.pop();
    heap.push({ f: a.f + b.f, ch: null, left: a, right: b });
  }
  return heap.pop();
}

// Build codebook from tree. O(n)
function buildCodes(root) {
  var codes = {};
  if (!root) return codes;
  function walk(node, prefix) {
    if (node.ch !== null && node.ch !== undefined) { codes[node.ch] = prefix || '0'; return; }
    if (node.left) walk(node.left, prefix + '0');
    if (node.right) walk(node.right, prefix + '1');
  }
  walk(root, '');
  return codes;
}

// Encode a string to {tree, bits}. O(m)
function huffmanEncode(str) {
  if (!str) return { tree: null, bits: '' };
  var f = freqTable(str);
  var root = buildTree(f);
  var codes = buildCodes(root);
  var bits = '';
  for (var i = 0; i < str.length; i++) bits += codes[str.charCodeAt(i)];
  return { tree: root, bits: bits };
}

// Decode bits back to string using the tree. O(m)
function huffmanDecode(root, bits) {
  if (!root) return '';
  // If tree is a single character
  if (root.left === null && root.right === null) {
    var ch = String.fromCharCode(root.ch);
    return ch.repeat(bits.length || 1);
  }
  var out = '';
  var node = root;
  for (var i = 0; i < bits.length; i++) {
    node = bits[i] === '0' ? node.left : node.right;
    if (node.left === null && node.right === null) {
      out += String.fromCharCode(node.ch);
      node = root;
    }
  }
  return out;
}

// Serialize tree to a flat array for storage: [charCodeOrNull, leftIdxOrNull, rightIdxOrNull][]
function serializeTree(node) {
  if (!node) return [];
  var nodes = [];
  function walk(n) {
    var idx = nodes.length;
    nodes.push({ c: n.ch, l: null, r: null });
    if (n.left) { nodes[idx].l = nodes.length; walk(n.left); }
    if (n.right) { nodes[idx].r = nodes.length; walk(n.right); }
  }
  walk(node);
  return nodes;
}

// Deserialize tree from flat array. O(n)
function deserializeTree(arr, idx) {
  if (idx === null || idx === undefined) return null;
  var rec = arr[idx];
  var node = { ch: rec.c, left: null, right: null };
  if (rec.l !== null) node.left = deserializeTree(arr, rec.l);
  if (rec.r !== null) node.right = deserializeTree(arr, rec.r);
  return node;
}

// Compress a string and return a JSON-serializable object. O(m + n log n)
function compress(str) {
  var enc = huffmanEncode(str);
  return {
    tree: serializeTree(enc.tree),
    bits: enc.bits,
    originalLen: str.length
  };
}

// Decompress from a JSON-serializable object back to string. O(m + n)
function decompress(obj) {
  // An empty tree means there was nothing to encode. Note that [] is truthy,
  // so the length check matters: deserializeTree would dereference a missing
  // node otherwise.
  if (!obj || !obj.tree || !obj.tree.length) return '';
  var root = deserializeTree(obj.tree, 0);
  return huffmanDecode(root, obj.bits || '');
}

// Quick round-trip test helper
function roundTrip(str) {
  var c = compress(str);
  return decompress(c);
}

module.exports = {
  compress: compress,
  decompress: decompress,
  roundTrip: roundTrip,
  huffmanEncode: huffmanEncode,
  huffmanDecode: huffmanDecode,
  freqTable: freqTable,
  buildTree: buildTree,
  buildCodes: buildCodes,
  serializeTree: serializeTree,
  deserializeTree: deserializeTree,
  MinHeap: MinHeap
};
