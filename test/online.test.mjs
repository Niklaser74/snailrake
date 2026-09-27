// The pure parts of the online code: tournament codes, names, the share link,
// the clock and error mapping. The server itself is tested in supabase/tests.
//   node test/online.test.mjs
import assert from 'node:assert/strict';
import { normCode, cleanName, inviteLink, clock, errorKey, DURATIONS, DEFAULT_DURATION } from '../js/online.js';

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 3).join('\n     ')}`); }
}

test('codes: typed loosely, read strictly', () => {
  assert.equal(normCode('abc23'), 'ABC23');
  assert.equal(normCode(' ab-c 23 '), 'ABC23');
  assert.equal(normCode('ABC2'), '', 'too short');
  assert.equal(normCode('ABCO2'), '', 'O is not in the alphabet');
  assert.equal(normCode('ABC12'), '', '1 is not in the alphabet');
  assert.equal(normCode(null), '');
});

test('names: trimmed, no control characters, at most 24', () => {
  assert.equal(cleanName('  Katie  '), 'Katie');
  assert.equal(cleanName('a\u0000b\nc'), 'abc');
  assert.equal(cleanName('x'.repeat(40)).length, 24);
  assert.equal(cleanName(undefined), '');
});

test('the invite link keeps the mount point and adds ?t=', () => {
  const loc = { origin: 'https://snails.se', pathname: '/snailrake/' };
  assert.equal(inviteLink('ABC23', loc), 'https://snails.se/snailrake/?t=ABC23');
});

test('the clock counts down in m:ss and never below zero', () => {
  assert.equal(clock(180), '3:00');
  assert.equal(clock(59.2), '1:00');
  assert.equal(clock(9), '0:09');
  assert.equal(clock(-3), '0:00');
});

test('server errors map to known keys, the rest is the network', () => {
  assert.equal(errorKey(new Error('already played')), 'err.played');
  assert.equal(errorKey(new Error('tournament closed')), 'err.closed');
  assert.equal(errorKey(new Error('Failed to fetch')), 'err.net');
});

test('durations match the server check', () => {
  assert.deepEqual(DURATIONS, [60, 120, 180, 300]);
  assert.ok(DURATIONS.includes(DEFAULT_DURATION));
});

if (failed) { console.log(`${failed} failed`); process.exit(1); }
