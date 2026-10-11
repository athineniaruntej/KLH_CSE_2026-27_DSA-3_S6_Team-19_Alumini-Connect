/**
 * tests/run.js — Minimal async-capable test runner (Node built-ins only).
 *
 * Usage:
 *   npm test              run every suite
 *   npm test -- sort      run only suites whose name matches
 *
 * No test framework is used. This provides just enough describe/it plumbing
 * on top of Node's assert module, and supports tests that return a promise.
 */

var path = require('path');
var fs = require('fs');
var os = require('os');
var assert = require('assert');

var SUITES = ['lru', 'sort', 'huffman', 'storage', 'auth'];

var filter = process.argv[2] || '';
var cases = [];
var suiteStack = [];

function describe(name, fn) {
  suiteStack.push(name);
  fn();
  suiteStack.pop();
}

/** Register a test. `fn` may return a promise. */
function it(name, fn) {
  cases.push({ suite: suiteStack.join(' > '), name: name, fn: fn });
}

global.describe = describe;
global.it = it;
global.assert = assert;

// Isolate storage tests from the real data/ directory. The scratch dir lives in
// the OS temp folder rather than beside the project: this repo sits inside a
// OneDrive-synced folder, where the sync client briefly locks rewritten files
// and makes rename() fail intermittently.
var SCRATCH = path.join(os.tmpdir(), 'alumni-connect-tests-' + process.pid);
process.env.ALUMNI_DATA_DIR = SCRATCH;
if (fs.existsSync(SCRATCH)) fs.rmSync(SCRATCH, { recursive: true, force: true });
fs.mkdirSync(SCRATCH, { recursive: true });

var loaded = [];
for (var i = 0; i < SUITES.length; i++) {
  var name = SUITES[i];
  if (filter && name.indexOf(filter) === -1) continue;
  var file = path.join(__dirname, name + '.test.js');
  if (!fs.existsSync(file)) {
    console.log('skipping missing suite: ' + name);
    continue;
  }
  loaded.push(name);
  require(file);
}

function runOne(index) {
  if (index >= cases.length) return Promise.resolve();
  var c = cases[index];
  return Promise.resolve()
    .then(function () { return c.fn(); })
    .then(function () {
      console.log('    \u2713 ' + c.name);
    }, function (e) {
      console.log('    \u2717 ' + c.name);
      console.log('        ' + (e && e.message ? String(e.message).split('\n')[0] : e));
      failures.push({ suite: c.suite, name: c.name, err: e });
    })
    .then(function () { return runOne(index + 1); });
}

var failures = [];

console.log('Alumni Connect — test suite\n');
runOne(0).then(function () {
  var passed = cases.length - failures.length;
  console.log('\n' + '='.repeat(56));
  console.log('  suites: ' + loaded.join(', '));
  console.log('  passed: ' + passed + '   failed: ' + failures.length);
  console.log('='.repeat(56));

  if (failures.length) {
    console.log('\nFailures:');
    for (var f = 0; f < failures.length; f++) {
      console.log('\n[' + failures[f].suite + '] ' + failures[f].name);
      console.log(failures[f].err && failures[f].err.stack ? failures[f].err.stack : failures[f].err);
    }
  }

  try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  process.exit(failures.length ? 1 : 0);
});