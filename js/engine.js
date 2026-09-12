// The lawn. Pure state and a fixed-step simulation — no DOM, no canvas, no
// audio — so test/engine.test.mjs can run whole games in Node. Sounds and
// particles are read off `events` by main.js/view.js after every step.
import { LEVELS } from './levels.js';
import { mulberry32, Hasher } from './game/rng.js';
import { Rake } from './rake.js';
import { fall, resolveSupport, separate, clampWalls } from './physics.js';
import { refreshCarrying, stepCrawl, tryMerge, reap, checkTowers } from './merge.js';

export const H = 1 / 120;          // fixed step
export const MAX_SUBSTEPS = 4;     // per frame; beyond this we drop time (tab was hidden)
// Portrait-ish: phones are tall, and the view squashes depth to ~0.62.
export const WORLD_W = 420;
export const WORLD_D = 640;
export const SPAWN_LEVEL2 = 0.15;  // share of new snails that arrive as level two

export class Garden {
  constructor({ w = WORLD_W, d = WORLD_D, seed = (Date.now() | 0), rake = true } = {}) {
    this.w = w;
    this.d = d;
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.snails = [];
    this.nextId = 1;
    this.score = 0;
    this.over = false;
    this.overReason = null;
    this.dangerT = 0;
    this.deepest = 0;
    this.towerTop = null;
    this.events = [];
    this.time = 0;
    this.drops = 0;
    this.mergesThisStep = 0;
    this.next = this.rollNext();
    this.rake = new Rake(this);
    if (!rake) this.rake.state = 'off';
    this.acc = 0;
  }

  byId(id) {
    for (const s of this.snails) if (s.id === id) return s;
    return null;
  }

  rollNext() { return this.rng() < SPAWN_LEVEL2 ? 1 : 0; }

  spawn(level, x, y, z = 0) {
    const L = LEVELS[level];
    const s = {
      id: this.nextId++, level, x, y, z, vx: 0, vy: 0, vz: 0,
      r: L.r, thick: L.thick,
      state: 'settling', on: null, carrying: null, target: null,
      facing: this.rng() < 0.5 ? -1 : 1,
      restT: 0, retargetT: 0, mergeCooldown: 0, popT: 0,
      seed: this.rng(), dead: false,
    };
    this.snails.push(s);
    return s;
  }

  // Frame entry: advances by real time in fixed sub-steps.
  advance(dt) {
    this.acc = Math.min(this.acc + dt, H * MAX_SUBSTEPS);
    while (this.acc >= H) { this.step(H); this.acc -= H; }
  }

  step(h = H) {
    if (this.over) return;
    this.time += h;
    this.mergesThisStep = 0;
    this.rake.step(h);
    for (const s of this.snails) if (s.state === 'falling') fall(s, h);
    refreshCarrying(this);
    const onStack = (s, c) => { tryMerge(this, s, c); };
    for (const s of this.snails.slice()) resolveSupport(this, s, h, onStack);
    reap(this, h);
    refreshCarrying(this);
    stepCrawl(this, h);
    const before = this.snails.map((s) => [s.x, s.y]);
    separate(this);
    // passengers ride along when their carrier is shoved
    this.snails.forEach((s) => {
      if (s.on == null) return;
      const c = this.byId(s.on);
      if (!c) return;
      const j = this.snails.indexOf(c);
      if (j < 0) return;
      s.x += c.x - before[j][0];
      s.y += c.y - before[j][1];
    });
    clampWalls(this);
    for (const s of this.snails.slice()) resolveSupport(this, s, h, onStack);
    reap(this, h);
    refreshCarrying(this);
    checkTowers(this, h);
  }

  drop() { this.rake.drop(); this.drops++; }

  takeEvents() { const e = this.events; this.events = []; return e; }

  // A stable fingerprint of the whole state, for the determinism test and for
  // catching accidental physics changes.
  hash() {
    const hs = new Hasher();
    hs.int(this.snails.length).num(this.score).int(this.over ? 1 : 0).num(this.rake.x).num(this.rake.y);
    for (const s of [...this.snails].sort((a, b) => a.id - b.id)) {
      hs.int(s.id).int(s.level).num(Math.round(s.x * 100)).num(Math.round(s.y * 100)).num(Math.round(s.z * 100)).int(s.on ?? -1);
    }
    return hs.hex();
  }

  // Save/restore: the live state, not a history — it is a real-time game.
  toJSON() {
    return {
      v: 1, seed: this.seed, w: this.w, d: this.d, score: this.score, time: this.time, drops: this.drops,
      nextId: this.nextId, next: this.next, over: this.over, dangerT: this.dangerT,
      rake: { x: this.rake.x, y: this.rake.y, state: this.rake.state, t: this.rake.t, snail: this.rake.snail ? this.rake.snail.id : null },
      snails: this.snails.map((s) => ({ ...s })),
    };
  }

  static fromJSON(o) {
    const g = new Garden({ w: o.w, d: o.d, seed: o.seed });
    g.score = o.score; g.time = o.time; g.drops = o.drops || 0; g.nextId = o.nextId; g.next = o.next;
    g.over = o.over; g.dangerT = o.dangerT || 0;
    g.snails = o.snails.map((s) => ({ ...s }));
    g.rake.x = o.rake.x; g.rake.y = o.rake.y; g.rake.state = o.rake.state; g.rake.t = o.rake.t;
    g.rake.snail = o.rake.snail != null ? g.byId(o.rake.snail) : null;
    if (g.rake.state === 'ready' && !g.rake.snail) { g.rake.state = 'reload'; g.rake.t = 0; }
    return g;
  }
}
