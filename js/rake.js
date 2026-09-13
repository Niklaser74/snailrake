// The rake hangs over the pile with the next snail on it. Two buttons drive it
// sideways, the third lets go. The waiting snail has a patience clock — hold
// it too long and it crawls off wherever the rake happens to be.

export const RAKE_SPEED = 220;        // px/s while a button is held (≈1.6 s across)
export const RAKE_Y = 24;             // px from the top: the tine bar. A held level three clears the top line
export const HANG = 8;                // px between the tines and the top of the snail
export const RAKE_RETURNS_HOME = false; // true = back to the middle after every drop (claw-machine cost)
export const RAKE_RETURN_SPEED = 420; // px/s, not interruptible
export const HOLD_TIME = 6.0;         // s before the snail crawls off the rake by itself
export const HOLD_WARN = 4.5;         // s: it starts to wobble, a ring shrinks around it
export const RELOAD_DELAY = 0.35;     // s after a drop before the next snail is loaded
export const DROP_VY = 60;            // px/s downward nudge so it does not feel weightless
export const SLIP_VX = 40;            // px/s sideways when it crawls off by itself

export class Rake {
  constructor(g) {
    this.g = g;
    this.x = g.w / 2;
    this.held = { left: false, right: false };
    this.state = 'reload';       // 'ready' | 'returning' | 'reload' | 'off' (tests: no rake at all)
    this.t = 0;                  // reload timer, or hold time while ready
    this.snail = null;           // the snail on the rake
    this.wantDrop = false;
  }

  get y() { return RAKE_Y; }

  clampX() {
    const r = this.snail ? this.snail.r : 0;
    this.x = Math.max(r, Math.min(this.g.w - r, this.x));
  }

  step(dt) {
    const g = this.g;
    if (g.over || this.state === 'off') return;
    if (this.state === 'reload') {
      this.t += dt;
      if (this.t >= RELOAD_DELAY) {
        this.t = 0;
        this.snail = g.spawn(g.next, this.x, RAKE_Y);
        this.snail.state = 'held';
        this.clampX();
        g.next = g.rollNext();
        this.state = 'ready';
        g.events.push({ type: 'load', level: this.snail.level });
      }
      return;
    }
    if (this.state === 'returning') {
      const home = g.w / 2;
      const d = home - this.x;
      const step = RAKE_RETURN_SPEED * dt;
      if (Math.abs(d) <= step) { this.x = home; this.state = 'reload'; this.t = 0; }
      else this.x += Math.sign(d) * step;
      return;
    }
    // ready: carrying a snail
    const dir = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
    if (dir) { this.x += dir * RAKE_SPEED * dt; this.clampX(); }
    this.t += dt;
    const s = this.snail;
    s.x = this.x;
    s.y = RAKE_Y + HANG + s.r;
    if (dir) s.facing = dir;
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
    s.vx = 0;
    s.vy = DROP_VY;
    s.restT = 0;
    if (slipped) s.vx = (s.seed < 0.5 ? -1 : 1) * SLIP_VX; // crawled off: lands a little to the side
    this.snail = null;
    this.held.left = false;
    this.held.right = false;
    this.state = RAKE_RETURNS_HOME ? 'returning' : 'reload';
    this.t = 0;
    this.g.events.push({ type: 'drop', level: s.level, slipped });
  }

  get holdFraction() { return this.state === 'ready' ? Math.min(1, this.t / HOLD_TIME) : 0; }
  get warning() { return this.state === 'ready' && this.t >= HOLD_WARN; }
}
