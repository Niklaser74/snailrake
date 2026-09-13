// Invariants that are cheap to lock: the five levels, the fifth colour, and
// that every UI string exists in both languages.
//   node test/rules.test.mjs
import assert from 'node:assert/strict';
import { LEVELS, PURPLE, TOP_LEVEL } from '../js/levels.js';
import { TEAM_COLORS } from '../js/game/snails.js';
import { keysOf } from '../js/i18n.js';

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}

test('five levels, strictly growing, slower as they grow', () => {
  assert.equal(LEVELS.length, 5);
  assert.equal(TOP_LEVEL, 4);
  for (let i = 1; i < LEVELS.length; i++) {
    assert.ok(LEVELS[i].r > LEVELS[i - 1].r, `r grows at ${i}`);
    assert.ok(LEVELS[i].scale > LEVELS[i - 1].scale, `scale grows at ${i}`);
    assert.ok(LEVELS[i].speed < LEVELS[i - 1].speed, `speed drops at ${i}`);
    assert.ok(LEVELS[i].score > LEVELS[i - 1].score, `score grows at ${i}`);
  }
});

test('five distinct colours: four from TEAM_COLORS, purple is ours alone', () => {
  const colours = LEVELS.map((l) => l.color);
  assert.equal(new Set(colours).size, 5);
  const team = new Set(TEAM_COLORS.map((c) => c.hex));
  const fromTeam = colours.filter((c) => team.has(c));
  assert.equal(fromTeam.length, 4, 'four level colours come from the shared palette');
  assert.ok(colours.includes(PURPLE));
  assert.ok(!team.has(PURPLE), 'if the game repo ever adds a fifth team colour, this needs a look');
});

test('i18n: sv and en have the same keys', () => {
  const sv = keysOf('sv').sort();
  const en = keysOf('en').sort();
  assert.deepEqual(en, sv);
});

if (failed) { console.log(`${failed} failed`); process.exit(1); }
