// Side-view physics for the pile, position-based (Suika-style). Snails are
// circles; gravity points down the screen. Each step predicts a position,
// projects out every overlap a few times, and reads the velocity back off the
// correction. No impulses, no rotation: the only things that have to hold are
// that snails pile up naturally, that a pile does not jitter, and that the
// whole thing is deterministic so test/engine.test.mjs can run games in Node.

export const G = 1500;            // px/s^2
export const AIR = 0.995;         // velocity kept per step while airborne
export const FRICTION = 0.80;     // horizontal velocity kept per step while touching something
export const BOUNCE = 0.18;       // share of the fall that comes back up
export const BOUNCE_MIN = 240;    // px/s below which it just lands
export const SEP_ITERS = 6;
export const SUPPORT_NY = 0.35;   // contact normal must point this much upward to count as "resting on"
export const REST_V = 10;         // px/s; slower than this while supported is "at rest"
export const CONTACT_SLOP = 0.6;  // px of overlap tolerated before a contact counts
export const MAX_V = 700;         // px/s; a newborn bigger snail gets shoved out of its neighbours in one step,
                                  // and read back as velocity that would launch it off the board

// Is this snail moved by the solver at all?
export function isFree(s) {
  return !s.dead && s.state !== 'held' && s.state !== 'climbing' && s.state !== 'popping';
}

// Predict: gravity plus whatever velocity it had.
export function integrate(s, dt) {
  s.px = s.x;
  s.py = s.y;
  s.vy += G * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
}

// Push every overlapping pair apart, the lighter one further. Walls and the
// floor are hard. A few passes are enough: the pile is never more than ~40.
export function solve(g, iters = SEP_ITERS) {
  const list = g.snails;
  for (let k = 0; k < iters; k++) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!isFree(a)) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!isFree(b)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const pen = a.r + b.r - d;
        if (pen <= 0) continue;
        const ma = a.r * a.r;
        const mb = b.r * b.r;
        const wa = mb / (ma + mb);
        const wb = ma / (ma + mb);
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * pen * wa; a.y -= ny * pen * wa;
        b.x += nx * pen * wb; b.y += ny * pen * wb;
      }
      bounds(g, a);
    }
  }
  for (const s of list) if (isFree(s)) bounds(g, s); // the last pair push may have left one in a wall
}

function bounds(g, s) {
  if (s.x < s.r) s.x = s.r;
  if (s.x > g.w - s.r) s.x = g.w - s.r;
  if (s.y > g.h - s.r) s.y = g.h - s.r;
}

// Velocity is whatever the corrected position says it is. Contacts damp it.
export function finish(g, s, dt) {
  const fellAt = s.vy;
  s.vx = (s.x - s.px) / dt;
  s.vy = (s.y - s.py) / dt;
  const v = Math.hypot(s.vx, s.vy);
  if (v > MAX_V) { s.vx *= MAX_V / v; s.vy *= MAX_V / v; }
  const touching = onFloor(g, s) || contacts(g, s).length > 0;
  if (touching) {
    s.vx *= FRICTION;
    if (fellAt > BOUNCE_MIN && s.vy < fellAt * 0.5) { // hit something hard
      s.vy = -fellAt * BOUNCE;
      g.events.push({ type: 'land', level: s.level, hard: true });
    }
  } else {
    s.vx *= AIR;
    s.vy *= AIR;
  }
  if (Math.abs(s.vx) < 0.5) s.vx = 0;
}

export function onFloor(g, s) { return s.y + s.r >= g.h - CONTACT_SLOP; }

export function contacts(g, s) {
  const out = [];
  for (const o of g.snails) {
    if (o === s || o.dead || o.state === 'held' || o.state === 'popping') continue;
    const d = Math.hypot(o.x - s.x, o.y - s.y);
    if (d <= s.r + o.r + CONTACT_SLOP) out.push(o);
  }
  return out;
}

// What holds this snail up: the floor (null) or the contact whose normal points
// most upward. Undefined means nothing does — it is in the air.
export function supportOf(g, s) {
  if (onFloor(g, s)) return null;
  let best;
  let bny = SUPPORT_NY;
  for (const o of contacts(g, s)) {
    const d = Math.hypot(o.x - s.x, o.y - s.y) || 0.001;
    const ny = (o.y - s.y) / d;
    if (ny > bny || (ny === bny && best && o.id < best.id)) { bny = ny; best = o; }
  }
  return best;
}

// Who holds whom, recomputed from the geometry every step. Fires `onStack`
// the moment a snail comes to rest on a new carrier — the single place in the
// codebase a merge can start.
export function resolveSupport(g, s, dt, onStack) {
  if (!isFree(s)) return;
  const sup = supportOf(g, s);
  if (sup === undefined) {
    if (s.state !== 'falling') { s.state = 'falling'; s.restT = 0; }
    s.on = null;
    return;
  }
  const speed = Math.hypot(s.vx, s.vy);
  if (s.state === 'falling') {
    if (speed > REST_V) return;
    s.state = 'settling';
    s.restT = 0;
    g.events.push({ type: 'land', level: s.level, hard: false });
  }
  const was = s.on;
  s.on = sup ? sup.id : null;
  if (sup && was !== sup.id) onStack(s, sup);
}
