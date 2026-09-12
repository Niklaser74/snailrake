// Position-based physics for the lawn. No impulse solver, no rotation: the only
// things that have to be true are that a snail ends up on top of another or
// beside it, that nothing overlaps once everything has settled, and that the
// whole thing is deterministic so test/engine.test.mjs can run it in Node.
// Relaxation gives all three in eighty lines; a real solver adds jitter and
// takes testability away.

export const G = 1400;          // px/s^2
export const AIR = 0.985;       // horizontal drag while falling
export const BOUNCE = 0.22;     // how much of the fall comes back off the grass
export const BOUNCE_MIN = 260;  // px/s below which it just settles
export const OVERLAP_ON = 0.55; // share of (ri+rj) within which a *falling* snail lands ON instead of beside
export const SLIDE_PUSH = 120;  // px/s outward shove when it catches the rim
export const CLIMB = 60;        // px/s a crawling snail climbs onto another
export const SEP_ITERS = 3;
export const LAYER = 0.6;       // share of the thinner snail's height that counts as "same layer"

// The highest snail we could be resting on: circles overlap, and its top is not
// so high above us that we would have to be lifted onto it.
export function supportUnder(g, s) {
  let best = null;
  let bz = -Infinity;
  for (const o of g.snails) {
    if (o === s || o.dead || o.state === 'held' || o.state === 'falling' || o.state === 'popping') continue;
    if (Math.hypot(s.x - o.x, s.y - o.y) > s.r + o.r) continue;
    const top = o.z + o.thick;
    if (top > s.z + s.thick + 1) continue;     // it towers over us; we are beside it, not on it
    if (carries(g, s, o)) continue;            // never rest on something resting on us
    if (s.state !== 'falling' && climber(s, o) !== s) continue; // of two on the ground, only one climbs
    if (top > bz || (top === bz && best && o.id < best.id)) { best = o; bz = top; }
  }
  return best;
}

// Two grounded snails that overlap: which one climbs on to the other? The one
// that is crawling towards the other; if both are (or neither is), the younger.
// Without this they raise each other's floor and rise forever.
function climber(a, b) {
  const at = a.target === b.id;
  const bt = b.target === a.id;
  if (at && !bt) return a;
  if (bt && !at) return b;
  return a.id > b.id ? a : b;
}

// Is `o` somewhere in the stack that `s` is holding up? Guards against cycles.
function carries(g, s, o) {
  let cur = o;
  for (let i = 0; i < 16 && cur; i++) {
    if (cur.on == null) return false;
    if (cur.on === s.id) return true;
    cur = g.byId(cur.on);
  }
  return false;
}

export function fall(s, h) {
  s.vz -= G * h;
  s.z += s.vz * h;
  s.x += s.vx * h;
  s.y += s.vy * h;
  s.vx *= AIR;
  s.vy *= AIR;
}

// Landing, stacking and sliding off a rim are one rule read three ways.
// `onStack(s, carrier)` is called the moment a snail comes to rest directly on
// another — the single place in the codebase where a merge can start.
export function resolveSupport(g, s, h, onStack) {
  if (s.dead || s.state === 'held' || s.state === 'popping') return;
  const carrier = supportUnder(g, s);
  const floor = carrier ? carrier.z + carrier.thick : 0;

  if (s.state === 'falling') {
    if (s.z > floor) return;                                   // still in the air
    if (!carrier) {
      s.z = 0;
      s.on = null;
      if (s.vz < -BOUNCE_MIN) { s.vz = -s.vz * BOUNCE; g.events.push({ type: 'land', level: s.level, hard: true }); return; }
      settle(g, s);
      return;
    }
    const dx = s.x - carrier.x;
    const dy = s.y - carrier.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    if (dist <= OVERLAP_ON * (s.r + carrier.r)) {
      s.z = floor;
      s.on = carrier.id;
      settle(g, s);
      onStack(s, carrier);
    } else {
      // caught the rim: shoved outward, keeps falling, lands beside it or on the next neighbour
      s.vx += (dx / dist) * SLIDE_PUSH;
      s.vy += (dy / dist) * SLIDE_PUSH;
      s.vz = -60;
      s.on = null;
      g.events.push({ type: 'slip', level: s.level });
    }
    return;
  }

  // Grounded. Follow the floor: climb onto what we crawled into, drop when the
  // thing under us is gone.
  if (s.z > floor + 0.5) { s.state = 'falling'; s.vz = 0; s.on = null; return; }
  if (s.z < floor) {
    s.z = Math.min(floor, s.z + CLIMB * h);
    if (s.z < floor) { s.on = null; return; }
  }
  s.z = floor;
  const was = s.on;
  s.on = carrier ? carrier.id : null;
  if (carrier && was !== carrier.id) onStack(s, carrier);
}

function settle(g, s) {
  s.state = 'settling';
  s.vz = 0;
  s.vx *= 0.25;
  s.vy *= 0.25;
  s.restT = 0;
  g.events.push({ type: 'land', level: s.level, hard: false });
}

export function separate(g, iters = SEP_ITERS) {
  const list = g.snails;
  for (let k = 0; k < iters; k++) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.state === 'held' || a.state === 'popping') continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.state === 'held' || b.state === 'popping') continue;
        if (a.on === b.id || b.on === a.id) continue;            // carrier and passenger are meant to overlap
        if (a.target === b.id || b.target === a.id) continue;    // it is climbing on to merge; let it through
        if (Math.abs(a.z - b.z) > Math.min(a.thick, b.thick) * LAYER) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const pen = a.r + b.r - d;
        if (pen <= 0) continue;
        const px = (dx / d) * pen * 0.3;
        const py = (dy / d) * pen * 0.3;
        a.x -= px; a.y -= py;
        b.x += px; b.y += py;
      }
    }
  }
}

export function clampWalls(g) {
  for (const s of g.snails) {
    if (s.state === 'held') continue;
    s.x = Math.max(s.r, Math.min(g.w - s.r, s.x));
    s.y = Math.max(s.r, Math.min(g.d - s.r, s.y));
  }
}
