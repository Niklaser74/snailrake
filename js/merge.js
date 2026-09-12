// Crawling, matching and the tower rule. Everything here is pure state on the
// Garden; sounds and effects are read off g.events by the view.
import { LEVELS, TOP_LEVEL } from './levels.js';

export const RETARGET_EVERY = 0.35; // s — not every frame, or it dithers between two equally near
export const CRAWL_RANGE = 200;     // px; beyond this it cannot be bothered
export const SETTLE_DELAY = 0.45;   // s after landing before it starts to crawl
export const MERGE_COOLDOWN = 0.25; // s after birth: let the animation be seen
export const POP_TIME = 0.35;       // s a level-five pair takes to vanish
export const MAX_MERGES_PER_STEP = 8;
export const TOWER_LIMIT = 3;       // this deep is danger
export const TOWER_GRACE = 3.0;     // s the top snail has to crawl off
export const ESCAPE_FACTOR = 2.6;   // a snail on top of another is in a hurry; on the grass it is not.
                                    // ≈21 px/s for a small top, so it clears a big carrier just inside TOWER_GRACE

export function depthOf(g, s) {
  let n = 1;
  let cur = s;
  for (let i = 0; i < 16 && cur && cur.on != null; i++) { cur = g.byId(cur.on); n++; }
  return n;
}

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
  let bd = CRAWL_RANGE;
  for (const o of g.snails) {
    if (o === s || o.dead || o.level !== s.level) continue;
    if (o.state === 'held' || o.state === 'falling' || o.state === 'popping') continue;
    if (o.carrying != null && o.carrying !== s.id) continue; // something else is already on it
    const d = Math.hypot(o.x - s.x, o.y - s.y);
    if (d < bd || (d === bd && best && o.id < best.id)) { bd = d; best = o; }
  }
  return best;
}

function moveToward(s, tx, ty, speed, h) {
  const dx = tx - s.x;
  const dy = ty - s.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.01) return;
  const step = Math.min(d, speed * h);
  s.x += (dx / d) * step;
  s.y += (dy / d) * step;
  if (Math.abs(dx) > 0.5) s.facing = dx < 0 ? -1 : 1;
}

// Only the top of a stack moves: a snail carrying another is frozen. That
// removes every bug where a carrier wanders off under its passenger, and it
// makes the rescue readable — in a tower exactly one snail is ever crawling.
export function stepCrawl(g, h) {
  for (const s of g.snails) {
    if (s.dead) continue;
    if (s.state !== 'settling' && s.state !== 'idle' && s.state !== 'crawling') continue;
    s.restT += h;
    if (s.mergeCooldown > 0) s.mergeCooldown -= h;
    if (s.state === 'settling') {
      if (s.restT < SETTLE_DELAY) continue;
      s.state = 'idle';
    }
    if (s.carrying != null) { s.state = 'idle'; s.target = null; continue; }

    s.retargetT -= h;
    if (s.retargetT <= 0) {
      s.retargetT = RETARGET_EVERY;
      const t = pickTarget(g, s);
      s.target = t ? t.id : null;
    }
    const tgt = s.target != null ? g.byId(s.target) : null;
    if (tgt && !tgt.dead) {
      s.state = 'crawling';
      // on top of someone it is in a hurry, whichever way it is going
      moveToward(s, tgt.x, tgt.y, LEVELS[s.level].speed * (s.on != null ? ESCAPE_FACTOR : 1), h);
      continue;
    }
    s.target = null;
    if (s.on != null) {
      // nothing to go for: climb down, straight away from whoever is carrying us
      const c = g.byId(s.on);
      if (c) {
        let dx = s.x - c.x;
        let dy = s.y - c.y;
        if (Math.hypot(dx, dy) < 0.5) { const a = s.seed * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); }
        s.state = 'crawling';
        moveToward(s, s.x + dx * 100, s.y + dy * 100, LEVELS[s.level].speed * ESCAPE_FACTOR, h);
        continue;
      }
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
    g.events.push({ type: 'pop', x: carrier.x, y: carrier.y, z: carrier.z, level: s.level, score: LEVELS[TOP_LEVEL].score });
    return true;
  }

  const level = s.level + 1;
  const born = g.spawn(level, carrier.x, carrier.y, carrier.z);
  born.on = carrier.on;
  born.state = 'settling';
  born.mergeCooldown = MERGE_COOLDOWN;
  born.facing = carrier.facing;
  s.dead = true;
  carrier.dead = true;
  g.score += LEVELS[level].score;
  g.events.push({ type: 'merge', x: born.x, y: born.y, z: born.z, level, score: LEVELS[level].score });
  return true;
}

// Pops finish, corpses leave the list, and anything that was resting on
// something that vanished starts falling.
export function reap(g, h) {
  for (const s of g.snails) {
    if (s.state === 'popping') { s.popT -= h; if (s.popT <= 0) s.dead = true; }
  }
  const alive = g.snails.filter((s) => !s.dead);
  if (alive.length !== g.snails.length) g.snails = alive;
  const ids = new Set(alive.map((s) => s.id));
  for (const s of alive) {
    if (s.on != null && !ids.has(s.on)) { s.on = null; if (s.state !== 'falling') { s.state = 'falling'; s.vz = 0; } }
    if (s.target != null && !ids.has(s.target)) s.target = null;
  }
}

export function checkTowers(g, h) {
  let deepest = 0;
  let tower = null;
  for (const s of g.snails) {
    if (s.dead || s.state === 'popping' || s.state === 'falling') continue;
    const d = depthOf(g, s);
    if (d > deepest) { deepest = d; tower = s; }
  }
  g.deepest = deepest;
  g.towerTop = tower ? tower.id : null;
  if (deepest >= TOWER_LIMIT + 1) { g.over = true; g.overReason = 'tower4'; g.events.push({ type: 'over', reason: 'tower4' }); return; }
  if (deepest >= TOWER_LIMIT) {
    g.dangerT += h;
    if (g.dangerT >= TOWER_GRACE) { g.over = true; g.overReason = 'tower3'; g.events.push({ type: 'over', reason: 'tower3' }); }
  } else {
    g.dangerT = 0;
  }
}
