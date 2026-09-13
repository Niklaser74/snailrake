// Crawling, matching and the top line. Everything here is pure state on the
// Garden; sounds and effects are read off g.events by the view.
import { LEVELS, TOP_LEVEL } from './levels.js';
import { onFloor } from './physics.js';

export const RETARGET_EVERY = 0.35; // s — not every frame, or it dithers between two equally near
export const CRAWL_GAP = 30;        // px short of touching that still counts as a neighbour worth crawling to.
                                    // Neighbours only — with the whole floor in reach the pile tidies itself and never grows
export const SETTLE_DELAY = 0.45;   // s after landing before it starts to crawl
export const MERGE_COOLDOWN = 0.25; // s after birth: let the animation be seen
export const POP_TIME = 0.35;       // s a level-five pair takes to vanish
export const MAX_MERGES_PER_STEP = 8;
export const CLIMB_SPEED = 24;      // px/s along the rim of the snail it is climbing on to
export const TOP_LINE = 150;        // px from the top; a snail resting above it is the danger
export const TOP_GRACE = 3.5;       // s it has to crawl down before the game is over
export const ESCAPE_FACTOR = 7.5;   // a snail above the line is in a hurry; on the pile it is not.
                                    // 30 px/s for a yellow: off a blue's back (≈70 px) in 2.3 s. A purple
                                    // at 19 px/s needs 112 px to get off a red — it will not make it

const TOP = -Math.PI / 2;           // "up" in screen coordinates

export function aboveLine(s) { return s.y - s.r < TOP_LINE; }

// Who is resting on whom, recomputed every step from the `on` links.
export function refreshCarrying(g) {
  for (const s of g.snails) s.carrying = null;
  for (const s of g.snails) {
    if (s.dead || s.on == null) continue;
    const c = g.byId(s.on);
    if (c) c.carrying = s.id;
  }
}

function pickTarget(g, s) {
  let best = null;
  const gap = g.crawlGap ?? CRAWL_GAP;
  if (gap < 0) return null;
  let bd = Infinity;
  for (const o of g.snails) {
    if (o === s || o.dead || o.level !== s.level) continue;
    if (o.state === 'held' || o.state === 'falling' || o.state === 'popping' || o.state === 'climbing') continue;
    if (o.carrying != null && o.carrying !== s.id) continue; // its back is taken
    const d = Math.hypot(o.x - s.x, o.y - s.y) - (s.r + o.r);
    if (d > gap) continue;
    if (d < bd || (d === bd && best && o.id < best.id)) { bd = d; best = o; }
  }
  return best;
}

// The height of the pile's surface at x, ignoring `self`: the lowest y-r of
// anything whose width covers x, or the floor.
export function surfaceAt(g, x, self) {
  let top = g.h;
  for (const o of g.snails) {
    if (o === self || o.dead || o.state === 'held' || o.state === 'popping' || o.state === 'climbing') continue;
    if (Math.abs(o.x - x) > o.r) continue;
    top = Math.min(top, o.y - o.r);
  }
  return top;
}

function walk(s, dir, speed, dt) {
  s.x += dir * speed * dt;
  s.facing = dir < 0 ? -1 : 1;
}

function angleTo(target, s) { return Math.atan2(s.y - target.y, s.x - target.x); }
function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

// Snails at rest crawl along whatever they lie on, towards the nearest of
// their colour, and climb on to it. Only the surface moves: a snail carrying
// another is frozen, and so is one being climbed on. A snail above the line
// with nothing to go for heads for the lower side of the pile, in a hurry.
export function stepCrawl(g, dt, onStack) {
  const climbedOn = new Set();
  for (const s of g.snails) if (s.state === 'climbing' && s.target != null) climbedOn.add(s.target);

  for (const s of g.snails) {
    if (s.dead) continue;
    if (s.mergeCooldown > 0) s.mergeCooldown -= dt;

    if (s.state === 'climbing') {
      const t = s.target != null ? g.byId(s.target) : null;
      if (!t || t.dead || t.state === 'held' || t.state === 'popping' || t.state === 'climbing') {
        s.state = 'falling'; s.target = null; s.vx = 0; s.vy = 0; continue;
      }
      const R = s.r + t.r;
      let a = angleTo(t, s);
      const delta = wrap(TOP - a);
      const w = (CLIMB_SPEED / R) * dt;
      a += Math.sign(delta) * Math.min(Math.abs(delta), w);
      // the arc may dip below the floor or into a wall when the target sits at an edge
      s.x = Math.max(s.r, Math.min(g.w - s.r, t.x + Math.cos(a) * R));
      s.y = Math.min(t.y + Math.sin(a) * R, g.h - s.r);
      s.facing = t.x < s.x ? -1 : 1;
      if (Math.abs(wrap(TOP - a)) < 0.02) {
        s.x = t.x; s.y = t.y - R;
        s.state = 'settling'; s.restT = 0; s.vx = 0; s.vy = 0;
        s.target = null;
        const was = s.on;
        s.on = t.id;
        if (was !== t.id) onStack(s, t);
      }
      continue;
    }

    if (s.state !== 'settling' && s.state !== 'idle' && s.state !== 'crawling') continue;
    s.restT += dt;
    if (s.state === 'settling') {
      if (s.restT < SETTLE_DELAY) continue;
      s.state = 'idle';
    }
    if (s.carrying != null || climbedOn.has(s.id)) { s.state = 'idle'; s.target = null; continue; }
    if (s.on == null && !onFloor(g, s)) continue; // mid-air, physics owns it

    s.retargetT -= dt;
    if (s.retargetT <= 0) {
      s.retargetT = RETARGET_EVERY;
      const t = pickTarget(g, s);
      s.target = t ? t.id : null;
    }
    const hurry = aboveLine(s) ? ESCAPE_FACTOR : 1;
    const speed = LEVELS[s.level].speed * hurry;
    const tgt = s.target != null ? g.byId(s.target) : null;
    if (tgt && !tgt.dead) {
      if (tgt.id === s.on) { s.target = null; continue; } // already on it; the merge rule decides
      const d = Math.hypot(tgt.x - s.x, tgt.y - s.y);
      if (d <= s.r + tgt.r + 1.5) { s.state = 'climbing'; s.vx = 0; s.vy = 0; continue; }
      s.state = 'crawling';
      if (Math.abs(tgt.x - s.x) > 0.5) walk(s, Math.sign(tgt.x - s.x), speed, dt);
      continue;
    }
    s.target = null;
    if (aboveLine(s)) {
      // nothing to go for: get down. Head for whichever side of the pile is lower.
      const left = surfaceAt(g, s.x - s.r * 2, s);
      const right = surfaceAt(g, s.x + s.r * 2, s);
      let dir = right > left ? 1 : right < left ? -1 : (s.seed < 0.5 ? -1 : 1);
      if (s.x - s.r <= 0.5) dir = 1;
      if (s.x + s.r >= g.w - 0.5) dir = -1;
      s.state = 'crawling';
      walk(s, dir, speed, dt);
      continue;
    }
    s.state = 'idle';
  }
}

// The one merge rule: a snail that has come to rest directly on an identical
// one grows into the next level. Neighbours do not count.
export function tryMerge(g, s, carrier) {
  if (s.dead || carrier.dead) return false;
  if (s.level !== carrier.level) return false;
  if (s.state === 'popping' || carrier.state === 'popping') return false;
  if (s.mergeCooldown > 0 || carrier.mergeCooldown > 0) return false;
  if (g.mergesThisStep >= MAX_MERGES_PER_STEP) return false;
  g.mergesThisStep++;

  if (s.level >= TOP_LEVEL) {
    s.state = 'popping'; carrier.state = 'popping';
    s.popT = POP_TIME; carrier.popT = POP_TIME;
    s.on = null; s.target = null; carrier.target = null;
    g.score += LEVELS[TOP_LEVEL].score;
    g.events.push({ type: 'pop', x: carrier.x, y: carrier.y - carrier.r, level: s.level, score: LEVELS[TOP_LEVEL].score });
    return true;
  }

  const level = s.level + 1;
  const born = g.spawn(level, carrier.x, carrier.y);
  born.y = Math.min(born.y, g.h - born.r);
  born.on = carrier.on;
  born.state = 'settling';
  born.mergeCooldown = MERGE_COOLDOWN;
  born.facing = carrier.facing;
  s.dead = true;
  carrier.dead = true;
  g.score += LEVELS[level].score;
  g.events.push({ type: 'merge', x: born.x, y: born.y - born.r, level, score: LEVELS[level].score });
  return true;
}

// Pops finish, corpses leave the list, and anything that was resting on or
// heading for something that vanished lets go of it.
export function reap(g, dt) {
  for (const s of g.snails) {
    if (s.state === 'popping') { s.popT -= dt; if (s.popT <= 0) s.dead = true; }
  }
  const alive = g.snails.filter((s) => !s.dead);
  if (alive.length !== g.snails.length) g.snails = alive;
  const ids = new Set(alive.map((s) => s.id));
  for (const s of alive) {
    if (s.on != null && !ids.has(s.on)) { s.on = null; if (s.state !== 'falling' && s.state !== 'climbing') { s.state = 'falling'; s.restT = 0; } }
    if (s.target != null && !ids.has(s.target)) { s.target = null; if (s.state === 'climbing') { s.state = 'falling'; s.vx = 0; s.vy = 0; } }
  }
}

// The pile may not reach the line. A snail at rest above it starts the clock;
// the clock stops the moment nothing is up there.
export function checkTopLine(g, dt) {
  let top = null;
  for (const s of g.snails) {
    if (s.dead || s.state === 'popping' || s.state === 'falling' || s.state === 'held' || s.state === 'climbing') continue;
    if (!aboveLine(s)) continue;
    if (!top || s.y - s.r < top.y - top.r) top = s;
  }
  g.dangerTop = top ? top.id : null;
  if (top) {
    g.dangerT += dt;
    if (g.dangerT >= TOP_GRACE) { g.over = true; g.overReason = 'top'; g.events.push({ type: 'over', reason: 'top' }); }
  } else {
    g.dangerT = 0;
  }
}
