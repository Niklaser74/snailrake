// The pile. Pure state and a fixed-step simulation — no DOM, no canvas, no
// audio — so test/engine.test.mjs can run whole games in Node. Sounds and
// particles are read off `events` by main.js/view.js after every step.
//
// World: x to the right, y down the screen, the floor at y = h. Gravity is +y.
import { LEVELS } from './levels.js';
import { mulberry32, Hasher } from './game/rng.js';
import { Rake } from './rake.js';
import { isFree, integrate, solve, finish, resolveSupport } from './physics.js';
import { refreshCarrying, stepCrawl, tryMerge, reap, checkTopLine, CRAWL_GAP } from './merge.js';

export const H = 1 / 120;          // fixed step
export const MAX_SUBSTEPS = 4;     // per frame; beyond this we drop time (tab was hidden)
// Portrait: phones are tall. About two and a half red snails wide — see levels.js.
export const WORLD_W = 330;
export const WORLD_H = 560;
export const SPAWN_MIX = [0.6, 0.28, 0.12]; // share of new snails arriving as level one, two, three

export class Garden {
  constructor({ w = WORLD_W, h = WORLD_H, seed = (Date.now() | 0), rake = true, crawlGap = CRAWL_GAP } = {}) {
    this.w = w;
    this.h = h;
    this.crawlGap = crawlGap;        // overridable so balancing scripts can measure the pile with and without crawling
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.snails = [];
    this.nextId = 1;
    this.score = 0;
    this.over = false;
    this.overReason = null;
    this.dangerT = 0;
    this.dangerTop = null;
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

  rollNext() {
    let r = this.rng();
    for (let i = 0; i < SPAWN_MIX.length; i++) { r -= SPAWN_MIX[i]; if (r < 0) return i; }
    return SPAWN_MIX.length - 1;
  }

  spawn(level, x, y) {
    const L = LEVELS[level];
    const s = {
      id: this.nextId++, level, x, y, px: x, py: y, vx: 0, vy: 0,
      r: L.r,
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

  step(dt = H) {
    if (this.over) return;
    this.time += dt;
    this.mergesThisStep = 0;
    const onStack = (s, c) => { tryMerge(this, s, c); };
    this.rake.step(dt);
    refreshCarrying(this);
    stepCrawl(this, dt, onStack);   // kinematic: crawling and climbing move x/y directly
    reap(this, dt);
    for (const s of this.snails) if (isFree(s)) integrate(s, dt);
    solve(this);
    for (const s of this.snails) if (isFree(s)) finish(this, s, dt);
    for (const s of this.snails.slice()) resolveSupport(this, s, dt, onStack);
    reap(this, dt);
    refreshCarrying(this);
    checkTopLine(this, dt);
  }

  drop() { this.rake.drop(); this.drops++; }

  takeEvents() { const e = this.events; this.events = []; return e; }

  // A stable fingerprint of the whole state, for the determinism test and for
  // catching accidental physics changes.
  hash() {
    const hs = new Hasher();
    hs.int(this.snails.length).num(this.score).int(this.over ? 1 : 0).num(this.rake.x);
    for (const s of [...this.snails].sort((a, b) => a.id - b.id)) {
      hs.int(s.id).int(s.level).num(Math.round(s.x * 100)).num(Math.round(s.y * 100)).int(s.on ?? -1);
    }
    return hs.hex();
  }

  // Save/restore: the live state, not a history — it is a real-time game.
  toJSON() {
    return {
      v: 2, seed: this.seed, w: this.w, h: this.h, score: this.score, time: this.time, drops: this.drops,
      nextId: this.nextId, next: this.next, over: this.over, dangerT: this.dangerT,
      rake: { x: this.rake.x, state: this.rake.state, t: this.rake.t, snail: this.rake.snail ? this.rake.snail.id : null },
      snails: this.snails.map((s) => ({ ...s })),
    };
  }

  static fromJSON(o) {
    if (o.v !== 2) throw new Error('old save');
    const g = new Garden({ w: o.w, h: o.h, seed: o.seed });
    g.score = o.score; g.time = o.time; g.drops = o.drops || 0; g.nextId = o.nextId; g.next = o.next;
    g.over = o.over; g.dangerT = o.dangerT || 0;
    g.snails = o.snails.map((s) => ({ ...s }));
    g.rake.x = o.rake.x; g.rake.state = o.rake.state; g.rake.t = o.rake.t;
    g.rake.snail = o.rake.snail != null ? g.byId(o.rake.snail) : null;
    if (g.rake.state === 'ready' && !g.rake.snail) { g.rake.state = 'reload'; g.rake.t = 0; }
    return g;
  }
}
