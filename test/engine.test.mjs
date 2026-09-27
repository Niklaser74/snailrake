// The rules, run headless: merging, popping, chains, the top line, the rescue,
// rolling off instead of landing on, invariants under random play, determinism.
//   node test/engine.test.mjs
import assert from 'node:assert/strict';
import { Garden, H } from '../js/engine.js';
import { TOP_GRACE, TOP_LINE, CRAWL_GAP } from '../js/merge.js';
import { LEVELS } from '../js/levels.js';
import { mulberry32 } from '../js/game/rng.js';

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 3).join('\n     ')}`); }
}
function run(g, seconds) { const n = Math.round(seconds / H); for (let i = 0; i < n; i++) g.step(H); return n; }
function runUntil(g, pred, maxSeconds = 20) {
  const n = Math.round(maxSeconds / H);
  for (let i = 0; i < n; i++) { if (pred(g)) return i; g.step(H); }
  return -1;
}
const floor = (g, level) => g.h - LEVELS[level].r;
// a column of snails standing on each other at x, bottom first
function column(g, x, levels) {
  let y = g.h;
  const out = [];
  for (const lv of levels) { y -= LEVELS[lv].r; const s = g.spawn(lv, x, y); out.push(s); y -= LEVELS[lv].r; }
  return out;
}

test('two level-one snails crawl together and become one level two', () => {
  const g = new Garden({ seed: 1, rake: false });
  g.spawn(0, 150, floor(g, 0)); g.spawn(0, 190, floor(g, 0));
  const steps = runUntil(g, (x) => x.snails.length === 1, 14);
  assert.ok(steps >= 0, 'merged within 14 s');
  assert.equal(g.snails[0].level, 1);
  assert.equal(g.score, LEVELS[1].score);
});

test('two level-five snails pop and free the pile', () => {
  const g = new Garden({ seed: 2, rake: false });
  g.spawn(4, 100, floor(g, 4)); g.spawn(4, 100 + LEVELS[4].r * 2, floor(g, 4)); // touching
  const steps = runUntil(g, (x) => x.snails.length === 0, 16);
  assert.ok(steps >= 0, 'popped within 16 s');
  assert.equal(g.score, LEVELS[4].score);
});

test('a chain: 1+1 -> 2 meets a 2 -> 3, and it terminates', () => {
  const g = new Garden({ seed: 3, rake: false, crawlGap: 80 }); // wide enough that whichever of the pair grows is in reach of the two
  g.spawn(0, 150, floor(g, 0)); g.spawn(0, 194, floor(g, 0)); g.spawn(1, 90, floor(g, 1));
  const steps = runUntil(g, (x) => x.snails.length === 1 && x.snails[0].level === 2, 30);
  assert.ok(steps >= 0, 'chain completed within 30 s');
  assert.equal(g.score, LEVELS[1].score + LEVELS[2].score);
});

test('a snail lands directly on its twin and they merge at once', () => {
  const g = new Garden({ seed: 9, rake: false });
  g.spawn(2, 165, floor(g, 2));
  const s = g.spawn(2, 165, 200); s.state = 'falling';
  const steps = runUntil(g, (x) => x.snails.length === 1, 3);
  assert.ok(steps >= 0, 'merged on landing');
  assert.equal(g.snails[0].level, 3);
});

test('a pile at the line with nowhere to go is game over after the grace', () => {
  const w = LEVELS[4].r * 2 + 4;
  const g = new Garden({ seed: 4, rake: false, w }); // a chimney: the top cannot get down
  const col = column(g, w / 2, [4, 3, 4, 3, 1]); // no two alike touch, so nothing merges its way out
  const top = col[col.length - 1];
  assert.ok(top.y - top.r < TOP_LINE, 'the column reaches above the line');
  const steps = runUntil(g, (x) => x.over, TOP_GRACE + 3);
  assert.ok(steps >= 0, 'game over came');
  assert.equal(g.overReason, 'top');
  assert.ok(steps * H >= TOP_GRACE - 0.2, `it waited the grace (${(steps * H).toFixed(2)} s)`);
});

test('the rescue: a small snail above the line crawls down and lives', () => {
  const g = new Garden({ seed: 5, rake: false });
  const col = column(g, 165, [4, 3, 4, 0]); // the column itself stays under the line; only the yellow pokes above
  const top = col[col.length - 1];
  assert.ok(col[2].y - col[2].r >= TOP_LINE, 'the column is under the line');
  assert.ok(top.y - top.r < TOP_LINE, 'the yellow starts above the line');
  run(g, TOP_GRACE + 2);
  assert.equal(g.over, false, 'no game over');
  assert.equal(g.dangerT, 0, 'nothing above the line any more');
  assert.ok(top.y - top.r >= TOP_LINE, 'the small one got down');
});

test('dropped off-centre on a big one it rolls off and lands beside', () => {
  const g = new Garden({ seed: 7, rake: false });
  const big = g.spawn(4, 165, floor(g, 4));
  const s = g.spawn(0, 165 + 30, 120); s.state = 'falling';
  runUntil(g, (x) => s.state === 'idle', 6);
  assert.equal(s.on, null, 'not resting on the big one');
  assert.ok(Math.abs(s.y + s.r - g.h) < 1, 'on the floor');
  assert.ok(Math.hypot(s.x - big.x, s.y - big.y) >= big.r + s.r - 1.5, 'pushed clear of it');
});

test('invariants under random play: walls, floor, overlap, no cyclic stacks', () => {
  for (let seed = 100; seed < 150; seed++) {
    const g = new Garden({ seed });
    const rng = mulberry32(seed * 7 + 1);
    for (let d = 0; d < 40 && !g.over; d++) {
      runUntil(g, (x) => x.rake.state === 'ready', 5);
      const dir = rng();
      g.rake.held.left = dir < 0.45; g.rake.held.right = dir > 0.55;
      run(g, rng() * 1.5);
      g.rake.held.left = false; g.rake.held.right = false;
      g.drop();
      run(g, 0.5 + rng() * 1.5);
    }
    run(g, 2);
    for (const s of g.snails) {
      if (s.state === 'held') continue;
      assert.ok(!Number.isNaN(s.x + s.y), `seed ${seed}: finite`);
      assert.ok(s.x >= s.r - 0.5 && s.x <= g.w - s.r + 0.5, `seed ${seed}: x in bounds (${s.x.toFixed(1)})`);
      assert.ok(s.y <= g.h - s.r + 0.5, `seed ${seed}: above the floor (${s.y.toFixed(1)})`);
      let cur = s; let n = 0;
      while (cur && cur.on != null && n < 64) { cur = g.byId(cur.on); n++; }
      assert.ok(n < 64, `seed ${seed}: no cyclic on-chain`);
    }
    for (let i = 0; i < g.snails.length; i++) for (let j = i + 1; j < g.snails.length; j++) {
      const a = g.snails[i], b = g.snails[j];
      if (a.state === 'held' || b.state === 'held' || a.state === 'climbing' || b.state === 'climbing') continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(d >= a.r + b.r - 3, `seed ${seed}: snails ${a.id} and ${b.id} overlap by ${(a.r + b.r - d).toFixed(2)} px`);
    }
  }
});

test('the same seed and inputs give the same pile', () => {
  function play(seed) {
    const g = new Garden({ seed });
    const rng = mulberry32(99);
    for (let d = 0; d < 12; d++) {
      runUntil(g, (x) => x.rake.state === 'ready', 5);
      const dir = rng();
      g.rake.held.left = dir < 0.4; g.rake.held.right = dir > 0.6;
      run(g, rng() * 1.5);
      g.rake.held.left = false; g.rake.held.right = false;
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
  run(g, 1); g.rake.held.right = true; run(g, 0.6); g.rake.held.right = false; g.drop(); run(g, 2);
  const copy = Garden.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
  assert.equal(copy.hash(), g.hash());
  run(g, 1); run(copy, 1);
  assert.equal(copy.hash(), g.hash(), 'and they keep in step');
});

test('a time limit ends the game once, with reason time', () => {
  const g = new Garden({ seed: 5, timeLimit: 2 });
  run(g, 1.9);
  assert.equal(g.over, false);
  run(g, 0.2);
  assert.equal(g.over, true);
  assert.equal(g.overReason, 'time');
  const overs = g.takeEvents().filter((e) => e.type === 'over');
  assert.equal(overs.length, 1);
  run(g, 1);
  assert.equal(g.takeEvents().filter((e) => e.type === 'over').length, 0);
});

test('a restored game keeps the snail sequence of its seed', () => {
  function play(g, drops) {
    for (let d = 0; d < drops; d++) { runUntil(g, (x) => x.rake.state === 'ready', 5); g.drop(); run(g, 0.8); }
  }
  const a = new Garden({ seed: 77, timeLimit: 180 });
  const b = new Garden({ seed: 77, timeLimit: 180 });
  play(a, 6); play(b, 6);
  const c = Garden.fromJSON(JSON.parse(JSON.stringify(b.toJSON())));
  assert.equal(c.timeLimit, 180);
  assert.equal(c.rngCalls, a.rngCalls);
  play(a, 8); play(c, 8);
  assert.equal(c.hash(), a.hash(), 'the restored copy dealt the same snails');
});

if (failed) { console.log(`${failed} failed`); process.exit(1); }
