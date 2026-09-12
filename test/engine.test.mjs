// The rules, run headless: merging, popping, chains, towers, the rescue,
// landing beside instead of on, invariants under random play, determinism.
//   node test/engine.test.mjs
import assert from 'node:assert/strict';
import { Garden, H } from '../js/engine.js';
import { TOWER_GRACE, depthOf } from '../js/merge.js';
import { OVERLAP_ON } from '../js/physics.js';
import { LEVELS } from '../js/levels.js';
import { mulberry32 } from '../js/game/rng.js';

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 3).join('\n     ')}`); }
}
function run(g, seconds) { const n = Math.round(seconds / H); for (let i = 0; i < n; i++) g.step(H); return n; }
function quiet(g) { return g.snails.every((s) => s.state === 'idle' || s.state === 'held'); }
function runUntil(g, pred, maxSeconds = 20) {
  const n = Math.round(maxSeconds / H);
  for (let i = 0; i < n; i++) { if (pred(g)) return i; g.step(H); }
  return -1;
}

test('two level-one snails crawl together and become one level two', () => {
  const g = new Garden({ seed: 1, rake: false });
  g.spawn(0, 200, 200); g.spawn(0, 230, 200);
  const steps = runUntil(g, (x) => x.snails.length === 1, 4);
  assert.ok(steps >= 0, 'merged within 4 s');
  assert.equal(g.snails[0].level, 1);
  assert.equal(g.score, LEVELS[1].score);
});

test('two level-five snails pop and free the lawn', () => {
  const g = new Garden({ seed: 2, rake: false });
  g.spawn(4, 200, 200); g.spawn(4, 250, 200);
  const steps = runUntil(g, (x) => x.snails.length === 0, 6);
  assert.ok(steps >= 0, 'popped within 6 s');
  assert.equal(g.score, LEVELS[4].score);
});

test('a chain: 1+1 -> 2 meets a 2 -> 3, and it terminates', () => {
  const g = new Garden({ seed: 3, rake: false });
  g.spawn(0, 200, 200); g.spawn(0, 226, 200); g.spawn(1, 260, 200);
  const steps = runUntil(g, (x) => x.snails.length === 1 && x.snails[0].level === 2, 10);
  assert.ok(steps >= 0, 'chain completed within 10 s');
  assert.ok(steps < 1200, `finished in ${steps} steps`);
  assert.equal(g.score, LEVELS[1].score + LEVELS[2].score);
});

test('a tower with a slow top and no match is game over after the grace', () => {
  const g = new Garden({ seed: 4, rake: false });
  const c = g.spawn(4, 240, 280);
  const b = g.spawn(1, 240, 280, c.thick); b.on = c.id;
  const a = g.spawn(3, 240, 280, c.thick + b.thick); a.on = b.id;
  run(g, 0.1);
  assert.equal(depthOf(g, a), 3);
  const steps = runUntil(g, (x) => x.over, TOWER_GRACE + 1.5);
  assert.ok(steps >= 0, 'game over came');
  assert.equal(g.overReason, 'tower3');
  assert.ok(steps * H >= TOWER_GRACE - 0.2, `it waited the grace (${(steps * H).toFixed(2)} s)`);
});

test('the rescue: a small top crawls off a tower and lives', () => {
  const g = new Garden({ seed: 5, rake: false });
  const c = g.spawn(4, 240, 280);
  const b = g.spawn(2, 240, 280, c.thick); b.on = c.id;
  const a = g.spawn(0, 240, 280, c.thick + b.thick); a.on = b.id;
  run(g, TOWER_GRACE + 1.5);
  assert.equal(g.over, false, 'no game over');
  assert.equal(g.dangerT, 0);
  assert.ok(depthOf(g, a) < 3, 'the top got down');
});

test('a small top with a matching neighbour merges and the tower is gone', () => {
  const g = new Garden({ seed: 6, rake: false });
  const c = g.spawn(4, 240, 280);
  const b = g.spawn(2, 240, 280, c.thick); b.on = c.id;
  const a = g.spawn(0, 240, 280, c.thick + b.thick); a.on = b.id;
  g.spawn(0, 300, 280);
  run(g, TOWER_GRACE + 2);
  assert.equal(g.over, false);
  assert.ok(g.snails.some((s) => s.level === 1), 'a level two was born from the top and its neighbour');
});

test('dropped off-centre it lands beside, not on', () => {
  const g = new Garden({ seed: 7, rake: false });
  const big = g.spawn(4, 240, 280);
  const off = OVERLAP_ON * (LEVELS[0].r + big.r) + 6; // just outside the "on" zone, still overlapping the circle
  const s = g.spawn(0, 240 + off, 280, 100); s.state = 'falling';
  runUntil(g, (x) => s.state !== 'falling' && s.state !== 'settling', 4);
  run(g, 0.2);
  assert.equal(s.on, null, 'not resting on the big one');
  assert.equal(s.z, 0);
  assert.ok(Math.hypot(s.x - big.x, s.y - big.y) >= big.r + s.r - 1, 'pushed clear of it');
});

test('invariants under random play: walls, overlap, no cyclic stacks', () => {
  for (let seed = 100; seed < 150; seed++) {
    const g = new Garden({ seed });
    const rng = mulberry32(seed * 7 + 1);
    for (let d = 0; d < 40 && !g.over; d++) {
      runUntil(g, (x) => x.rake.state === 'ready', 5);
      g.rake.held.x = rng() < 0.7; g.rake.held.y = rng() < 0.7;
      run(g, rng() * 2.5);
      g.rake.held.x = false; g.rake.held.y = false;
      g.drop();
      run(g, 0.5 + rng() * 1.5);
    }
    run(g, 1);
    for (const s of g.snails) {
      if (s.state === 'held') continue;
      assert.ok(s.x >= s.r - 0.01 && s.x <= g.w - s.r + 0.01, `seed ${seed}: x in bounds (${s.x.toFixed(1)})`);
      assert.ok(s.y >= s.r - 0.01 && s.y <= g.d - s.r + 0.01, `seed ${seed}: y in bounds (${s.y.toFixed(1)})`);
      assert.ok(depthOf(g, s) < 16, `seed ${seed}: no cyclic on-chain`);
      assert.ok(!Number.isNaN(s.x + s.y + s.z), `seed ${seed}: finite`);
    }
  }
});

test('idle lawns do not overlap', () => {
  const g = new Garden({ seed: 11, rake: false });
  const rng = mulberry32(11);
  for (let i = 0; i < 25; i++) g.spawn(Math.floor(rng() * 5), 40 + rng() * 400, 40 + rng() * 480);
  runUntil(g, quiet, 30);
  run(g, 0.5);
  for (let i = 0; i < g.snails.length; i++) for (let j = i + 1; j < g.snails.length; j++) {
    const a = g.snails[i], b = g.snails[j];
    if (a.on === b.id || b.on === a.id) continue;
    if (Math.abs(a.z - b.z) > Math.min(a.thick, b.thick) * 0.6) continue;
    if (a.target === b.id || b.target === a.id) continue;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    assert.ok(d >= a.r + b.r - 1.5, `snails ${a.id} and ${b.id} overlap by ${(a.r + b.r - d).toFixed(2)} px`);
  }
});

test('the same seed and inputs give the same lawn', () => {
  function play(seed) {
    const g = new Garden({ seed });
    const rng = mulberry32(99);
    for (let d = 0; d < 12; d++) {
      runUntil(g, (x) => x.rake.state === 'ready', 5);
      g.rake.held.x = rng() < 0.6; g.rake.held.y = rng() < 0.6;
      run(g, rng() * 2);
      g.rake.held.x = false; g.rake.held.y = false;
      g.drop();
      run(g, 1);
    }
    return g.hash();
  }
  assert.equal(play(42), play(42));
  assert.notEqual(play(42), play(43));
});

test('save and restore round-trips', () => {
  const g = new Garden({ seed: 8 });
  run(g, 1); g.rake.held.x = true; run(g, 1); g.rake.held.x = false; g.drop(); run(g, 2);
  const copy = Garden.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
  assert.equal(copy.hash(), g.hash());
  run(g, 1); run(copy, 1);
  assert.equal(copy.hash(), g.hash(), 'and they keep in step');
});

if (failed) { console.log(`${failed} failed`); process.exit(1); }
