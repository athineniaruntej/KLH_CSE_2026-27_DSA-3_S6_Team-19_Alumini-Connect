/**
 * tests/huffman.test.js — lib/huffman.js (Huffman coding for archived logs)
 */

var huffman = require('../lib/huffman');

describe('lib/huffman.js', function () {

  it('round-trips a simple string', function () {
    var text = 'alumni connect platform';
    assert.strictEqual(huffman.roundTrip(text), text);
  });

  it('round-trips a single repeated character', function () {
    assert.strictEqual(huffman.roundTrip('aaaaaaaaaaaaaaaaaaaa'), 'aaaaaaaaaaaaaaaaaaaa');
  });

  it('round-trips an empty string', function () {
    assert.strictEqual(huffman.roundTrip(''), '');
  });

  it('round-trips a single character', function () {
    assert.strictEqual(huffman.roundTrip('x'), 'x');
  });

  it('round-trips JSON-lines content, which is what archiving stores', function () {
    var lines = [];
    for (var i = 0; i < 50; i++) {
      lines.push(JSON.stringify({ id: 'N' + i, userId: 'U1', title: 'Mentorship update', read: false }));
    }
    var text = lines.join('\n');
    assert.strictEqual(huffman.roundTrip(text), text);
  });

  it('actually compresses repetitive log text', function () {
    var record = JSON.stringify({ id: 'N1', userId: 'U1', title: 'New mentorship request', message: 'x' });
    var text = '';
    for (var i = 0; i < 100; i++) text += record + '\n';
    var packed = huffman.compress(text);
    var ratio = (packed.bits.length / 8) / text.length;
    // Huffman on structured JSON typically lands near 0.4-0.6; anything under
    // 0.7 proves the coding is real rather than overhead.
    assert.ok(ratio < 0.7, 'expected real compression, got ratio ' + ratio.toFixed(3));
    assert.strictEqual(huffman.decompress(packed), text);
  });

  it('preserves non-ASCII characters', function () {
    var text = 'caf\u00e9 na\u00efve \u2014 r\u00e9sum\u00e9 \u00b7 \u20b9';
    assert.strictEqual(huffman.roundTrip(text), text);
  });

  it('produces a prefix-free codebook (no code is a prefix of another)', function () {
    var enc = huffman.huffmanEncode('abracadabra');
    var codes = huffman.buildCodes(enc.tree);
    var list = Object.keys(codes).map(function (k) { return codes[k]; });
    assert.ok(list.length > 1, 'expected a multi-symbol codebook');
    for (var i = 0; i < list.length; i++) {
      for (var j = 0; j < list.length; j++) {
        if (i === j) continue;
        assert.ok(list[j].indexOf(list[i]) !== 0,
          'code ' + list[i] + ' is a prefix of ' + list[j]);
      }
    }
  });

  it('decompress() tolerates an empty payload', function () {
    assert.strictEqual(huffman.decompress({ tree: [], bits: '' }), '');
    assert.strictEqual(huffman.decompress(null), '');
  });

});