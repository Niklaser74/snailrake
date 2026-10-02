// What the tournament notices say (supabase/functions/snailrake-notify/texts.js,
// shared with the edge function) and the deadline label in the lobby.
//   node test/notify.test.mjs
import assert from 'node:assert/strict';
import { payload, body } from '../supabase/functions/snailrake-notify/texts.js';
import { untilLabel } from '../js/online.js';

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 3).join('\n     ')}`); }
}

test('beaten, in both languages, with the score readable', () => {
  const p = { code: 'K7PXR', name: 'Katie', score: 7335 };
  assert.match(body('beaten', p, 'sv'), /^Katie slog dig med 7\s335 poäng i turneringen K7PXR\.$/);
  assert.match(body('beaten', p, 'en'), /^Katie beat you with 7,335 points in tournament K7PXR\.$/);
});

test('result: the winner hears they won, the rest where they came', () => {
  const won = { code: 'K7PXR', rank: 1, total: 3, winner: 'Bo', winner_score: 900, score: 900 };
  assert.match(body('result', won, 'sv'), /du vann med 900/);
  const third = { ...won, rank: 3, winner: 'Katie', winner_score: 7335, score: 200 };
  assert.match(body('result', third, 'sv'), /Katie vann med 7\s335\. Du kom på plats 3 av 3\./);
  assert.match(body('result', third, 'en'), /Katie won with 7,335\. You came #3 of 3\./);
});

test('rematch, and every notice opens its tournament in Snigelkrattan', () => {
  const n = payload('rematch', { code: 'ABC23', name: 'Bo' }, null);
  assert.equal(n.title, 'Snigelkrattan', 'no language → Swedish');
  assert.equal(n.body, 'Bo vill ha revansch! Ny turnering ABC23.');
  assert.equal(n.url, 'https://snails.se/snailrake/?t=ABC23');
  assert.equal(n.tag, 'snailrake-ABC23-rematch');
  assert.equal(payload('rematch', { code: 'ABC23', name: 'Bo' }, 'en').title, 'Snail Rake');
});

test('the deadline label', () => {
  const min = 60000, h = 60 * min, d = 24 * h;
  assert.equal(untilLabel(2 * d + 3 * h), '2 d 3 h');
  assert.equal(untilLabel(d), '1 d');
  assert.equal(untilLabel(5 * h + 10 * min), '5 h 10 min');
  assert.equal(untilLabel(4 * min), '4 min');
  assert.equal(untilLabel(-5), '0 min');
});

if (failed) { console.log(`${failed} failed`); process.exit(1); }
