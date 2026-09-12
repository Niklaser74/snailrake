// The rake: one axis per button, one direction per axis, and a trip home after
// every drop. The waiting snail has a patience clock — hold it too long and it
// crawls off wherever the rake happens to be.

export const RAKE_SPEED = 220;        // px/s while an axis button is held (≈1.8 s across, ≈2.8 s deep)
export const RAKE_RETURN_SPEED = 420; // px/s back to the corner; not interruptible — that is the cost
export const HOME = 22;               // the corner, inset so the snail on the rake sits on the lawn
export const RAKE_ONE_WAY = true;     // X only increases x, Y only increases y. false = ping-pong while held
export const HOLD_TIME = 6.0;         // s before the snail crawls off the rake by itself
export const HOLD_WARN = 4.5;         // s: it starts to wobble, a ring shrinks around it
export const RELOAD_DELAY = 0.35;     // s after arriving home before the next snail is loaded
export const DROP_HEIGHT = 120;       // px above the grass; ≈0.4 s of fall, enough for a bounce
export const DROP_VZ = -40;           // small downward nudge so it does not feel weightless

export class Rake {
  constructor(g) {
    this.g = g;
    this.x = HOME;
    this.y = HOME;
    this.dirX = 1;               // for ping-pong mode
    this.dirY = 1;
    this.held = { x: false, y: false };
    this.state = 'reload';       // 'ready' | 'returning' | 'reload' | 'off' (tests: no rake at all)
    this.t = 0;                  // reload timer, or hold time while ready
    this.snail = null;           // the snail on the rake
    this.wantDrop = false;
  }

  // Wall-clamped movement along an axis; one-way mode simply stops at the far wall.
  moveAxis(axis, h) {
    const max = axis === 'x' ? this.g.w : this.g.d;
    const dir = axis === 'x' ? 'dirX' : 'dirY';
    let v = this[axis] + RAKE_SPEED * h * (RAKE_ONE_WAY ? 1 : this[dir]);
    if (v >= max - HOME) { v = max - HOME; this[dir] = -1; }
    if (v <= HOME) { v = HOME; this[dir] = 1; }
    this[axis] = v;
  }

  step(h) {
    const g = this.g;
    if (g.over || this.state === 'off') return;
    if (this.state === 'reload') {
      this.t += h;
      if (this.t >= RELOAD_DELAY) {
        this.t = 0;
        this.snail = g.spawn(g.next, this.x, this.y, DROP_HEIGHT);
        this.snail.state = 'held';
        g.next = g.rollNext();
        this.state = 'ready';
        g.events.push({ type: 'load', level: this.snail.level });
      }
      return;
    }
    if (this.state === 'returning') {
      const dx = this.x - HOME;
      const dy = this.y - HOME;
      const d = Math.hypot(dx, dy);
      const step = RAKE_RETURN_SPEED * h;
      if (d <= step) { this.x = HOME; this.y = HOME; this.state = 'reload'; this.t = 0; this.dirX = 1; this.dirY = 1; }
      else { this.x -= (dx / d) * step; this.y -= (dy / d) * step; }
      return;
    }
    // ready: carrying a snail
    if (this.held.x) this.moveAxis('x', h);
    if (this.held.y) this.moveAxis('y', h);
    this.t += h;
    const s = this.snail;
    s.x = this.x;
    s.y = this.y;
    s.z = DROP_HEIGHT;
    if (this.wantDrop || this.t >= HOLD_TIME) {
      const slipped = !this.wantDrop;
      this.wantDrop = false;
      this.release(slipped);
    }
  }

  drop() { if (this.state === 'ready') this.wantDrop = true; }

  release(slipped) {
    const s = this.snail;
    s.state = 'falling';
    s.on = null;
    s.vz = DROP_VZ;
    s.vx = 0;
    s.vy = 0;
    s.restT = 0;
    if (slipped) { // crawled off: lands a little to the side, where it was heading
      const a = s.seed * Math.PI * 2;
      s.vx = Math.cos(a) * 30;
      s.vy = Math.sin(a) * 30;
    }
    this.snail = null;
    this.held.x = false;
    this.held.y = false;
    this.state = 'returning';
    this.t = 0;
    this.g.events.push({ type: 'drop', level: s.level, slipped });
  }

  get holdFraction() { return this.state === 'ready' ? Math.min(1, this.t / HOLD_TIME) : 0; }
  get warning() { return this.state === 'ready' && this.t >= HOLD_WARN; }
}
