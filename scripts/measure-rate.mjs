#!/usr/bin/env node
// Measures how fast points can come, to set the server's plausibility cap
// (SCORE_RATE_CAP in the snailrake migration). Two headless players:
// random (does not aim) and greedy (teleports the rake over the best match — a
// ceiling no human reaches). Prints points per second over the first N seconds.
//   node scripts/measure-rate.mjs [seconds=180] [games=40]
import { Garden, H } from '../js/engine.js';
import { mulberry32 } from '../js/game/rng.js';

const SECONDS = Number(process.argv[2]) || 180;
const GAMES = Number(process.argv[3]) || 40;

function surface(g) {
  const carried = new Set(g.snails.filter((s) => s.on != null).map((s) => s.on));
  return g.snails.filter((s) => s.state !== 'held' && s.state !== 'falling' && !carried.has(s.id));
}
function aimGreedy(g) {
  const lv = g.rake.snail.level;
  const same = surface(g).filter((s) => s.level === lv).sort((a, b) => b.y - a.y);
  if (same.length) return same[0].x;
  // otherwise the lowest spot: sample columns, pick where the pile is lowest
  let bestX = g.w / 2, bestTop = -1;
  for (let x = 20; x < g.w - 20; x += 15) {
    let top = g.h;
    for (const s of g.snails) if (s.state !== 'held' && Math.abs(s.x - x) < s.r) top = Math.min(top, s.y - s.r);
    if (top > bestTop) { bestTop = top; bestX = x; }
  }
  return bestX;
}
function play(seed, kind) {
  const g = new Garden({ seed, timeLimit: SECONDS });
  const rng = mulberry32(seed * 31 + 7);
  let peak = 0;
  while (!g.over) {
    if (g.rake.state === 'ready') {
      if (kind === 'greedy') { g.rake.x = aimGreedy(g); g.rake.clampX(); g.drop(); }
      else if (rng() < 0.02) { g.rake.x = 20 + rng() * (g.w - 40); g.rake.clampX(); g.drop(); }
    }
    g.step(H);
    if (g.time > 10) peak = Math.max(peak, g.score / g.time);
  }
  return { score: g.score, time: g.time, peak };
}
for (const kind of ['random', 'greedy']) {
  const rs = [];
  for (let s = 1; s <= GAMES; s++) rs.push(play(1000 + s, kind));
  const avg = (f) => (rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(1);
  const max = (f) => Math.max(...rs.map(f)).toFixed(2);
  console.log(`${kind.padEnd(7)} score avg ${avg((r) => r.score)} max ${max((r) => r.score)} | time avg ${avg((r) => r.time)} | p/s avg ${avg((r) => r.score / r.time)} max ${max((r) => r.score / r.time)} peak(>10s) ${max((r) => r.peak)}`);
}
