// The lawn seen from a raised angle. World (x, y) is the flat lawn, z is height
// above the grass; the depth axis is squashed and height lifts on screen, so a
// snail resting on another is drawn literally on top of it and the side-view
// snail renderer from Snäckmageddon can be used as is.
import { drawSnail } from './game/snails.js';
import { THEMES } from './game/themes.js';
import { mulberry32 } from './game/rng.js';
import { LEVELS, SNAIL_STYLE } from './levels.js';
import { DROP_HEIGHT, HOLD_WARN, HOLD_TIME } from './rake.js';
import { TOWER_GRACE, POP_TIME, depthOf } from './merge.js';

export const Y_SQUASH = 0.62; // depth axis compression
export const Z_LIFT = 0.9;    // 1 world px of height = 0.9 screen px up
const HEADROOM = 44;          // world px above the drop height for the held snail's body
const SOIL = 10;              // soil face below the lawn's front edge
const PAD = 10;

const theme = THEMES.garden;
const FLOWERS = ['#ff6b8a', '#c084fc', '#fff5cc', '#ffd166'];

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { k: 1, ox: 0, oy: 0 };
    this.w = 480;
    this.d = 560;
    this.seed = 1;
    this.lawn = null;
    this.particles = [];
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(canvas);
    this.layout();
  }

  setWorld(w, d, seed) { this.w = w; this.d = d; this.seed = seed; this.layout(); }

  layout() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.cw = Math.max(1, rect.width);
    this.ch = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.cw * dpr);
    this.canvas.height = Math.round(this.ch * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const top = (DROP_HEIGHT + HEADROOM) * Z_LIFT;
    const contentW = this.w + PAD * 2;
    const contentH = top + this.d * Y_SQUASH + SOIL + PAD * 2;
    const k = Math.min(this.cw / contentW, this.ch / contentH);
    this.cam.k = k;
    this.cam.ox = (this.cw - this.w * k) / 2;
    this.cam.oy = (this.ch - contentH * k) / 2 + (top + PAD) * k;
    this.paintLawn();
  }

  toScreen(x, y, z = 0) {
    return { sx: this.cam.ox + x * this.cam.k, sy: this.cam.oy + (y * Y_SQUASH - z * Z_LIFT) * this.cam.k };
  }

  // Mown stripes and a scatter of flowers, painted once per resize with the
  // garden's own seed so nothing dances between frames.
  paintLawn() {
    const { k, ox, oy } = this.cam;
    const W = this.w * k;
    const Hh = this.d * Y_SQUASH * k;
    const c = document.createElement('canvas');
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = Math.round(this.cw * dpr);
    c.height = Math.round(this.ch * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // soil face in front, then the lawn on top of it
    const soil = g.createLinearGradient(0, oy + Hh, 0, oy + Hh + SOIL * k);
    soil.addColorStop(0, theme.soil[0]);
    soil.addColorStop(1, theme.soil[2]);
    g.fillStyle = soil;
    g.fillRect(ox - 2 * k, oy + Hh - 2, W + 4 * k, SOIL * k + 2);
    g.fillStyle = theme.edge[1];
    g.fillRect(ox, oy, W, Hh);
    const stripe = 40 * Y_SQUASH * k;
    g.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 0, i = 0; y < Hh; y += stripe, i++) if (i % 2) g.fillRect(ox, oy + y, W, Math.min(stripe, Hh - y));
    g.strokeStyle = theme.edge[0];
    g.lineWidth = Math.max(1.5, 2.5 * k);
    g.strokeRect(ox, oy, W, Hh);
    const rng = mulberry32(this.seed);
    for (let i = 0; i < 48; i++) {
      const x = ox + rng() * W;
      const y = oy + rng() * Hh;
      const r = (1.6 + rng() * 1.4) * k;
      if (rng() < 0.45) { // tuft of grass
        g.strokeStyle = theme.edge[0];
        g.lineWidth = 1.2 * k;
        g.beginPath();
        for (let j = -1; j <= 1; j++) { g.moveTo(x, y); g.lineTo(x + j * 2 * k, y - (4 + rng() * 3) * k); }
        g.stroke();
        continue;
      }
      g.fillStyle = FLOWERS[Math.floor(rng() * FLOWERS.length)];
      for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, r * 0.75, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#fff2a8';
      g.beginPath(); g.arc(x, y, r * 0.6, 0, Math.PI * 2); g.fill();
    }
    this.lawn = c;
  }

  shadow(x, y, r, z) {
    const { sx, sy } = this.toScreen(x, y, 0);
    const k = this.cam.k;
    const a = Math.max(0.08, 0.32 - z / 500);
    this.ctx.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`;
    this.ctx.beginPath();
    this.ctx.ellipse(sx, sy, r * k, r * Y_SQUASH * k, 0, 0, Math.PI * 2);
    this.ctx.fill();
  }

  draw(g, time) {
    const ctx = this.ctx;
    const k = this.cam.k;
    ctx.clearRect(0, 0, this.cw, this.ch);
    if (this.lawn) ctx.drawImage(this.lawn, 0, 0, this.cw, this.ch);

    // ground shadows, airborne ones first so they read as "this is where it lands"
    for (const s of g.snails) if (!s.dead && s.state !== 'popping') this.shadow(s.x, s.y, s.r * 0.95, s.z);

    // the tower in danger: a ring that shrinks with the grace clock
    if (g.deepest >= 3 && g.towerTop != null) {
      const top = g.byId(g.towerTop);
      let base = top;
      for (let i = 0; i < 16 && base && base.on != null; i++) base = g.byId(base.on);
      if (base) {
        const { sx, sy } = this.toScreen(base.x, base.y, 0);
        const frac = 1 - Math.min(1, g.dangerT / TOWER_GRACE);
        const pulse = 1 + Math.sin(time * 12) * 0.06;
        ctx.save();
        ctx.lineWidth = 4 * k;
        ctx.strokeStyle = 'rgba(226,69,60,0.45)';
        ctx.beginPath(); ctx.ellipse(sx, sy, (base.r + 14) * k * pulse, (base.r + 14) * Y_SQUASH * k * pulse, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#e2453c';
        ctx.beginPath(); ctx.ellipse(sx, sy, (base.r + 14) * k * pulse, (base.r + 14) * Y_SQUASH * k * pulse, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
        ctx.restore();
      }
    }

    // depth sort: far to near, then low to high so a passenger draws after its carrier
    const items = g.snails.filter((s) => !s.dead).map((s) => ({ key: s.y + s.z * 0.001 + (s.state === 'held' ? 0.0005 : 0), snail: s }));
    const rk = g.rake;
    if (rk.state !== 'off') items.push({ key: rk.y - 0.0001, rake: rk });
    items.sort((a, b) => a.key - b.key);
    for (const it of items) {
      if (it.rake) { this.drawRake(it.rake, time); continue; }
      const s = it.snail;
      const L = LEVELS[s.level];
      let { sx, sy } = this.toScreen(s.x, s.y, s.z);
      let scale = L.scale * k;
      let alpha = 1;
      if (s.state === 'popping') { const f = Math.max(0, s.popT / POP_TIME); alpha = f; scale *= 1 + (1 - f) * 0.7; }
      if (s.state === 'held' && rk.warning && !this.reduced) sx += Math.sin(time * 28) * 2.2 * k;
      ctx.save();
      ctx.globalAlpha = alpha;
      drawSnail(ctx, SNAIL_STYLE, {
        x: sx, y: sy, facing: s.facing, color: L.color, scale,
        t: time + s.seed * 9, walking: s.state === 'crawling' && !this.reduced,
      });
      ctx.restore();
    }

    // patience ring around the held snail once it starts to fidget
    if (rk.state === 'ready' && rk.snail && rk.warning) {
      const s = rk.snail;
      const { sx, sy } = this.toScreen(s.x, s.y, s.z);
      const left = 1 - (rk.t - HOLD_WARN) / (HOLD_TIME - HOLD_WARN);
      const r = (s.r + 16) * k;
      ctx.save();
      ctx.lineWidth = 3.5 * k;
      ctx.strokeStyle = 'rgba(226,69,60,0.35)';
      ctx.beginPath(); ctx.arc(sx, sy - 14 * k * LEVELS[s.level].scale, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#e2453c';
      ctx.beginPath(); ctx.arc(sx, sy - 14 * k * LEVELS[s.level].scale, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, left)); ctx.stroke();
      ctx.restore();
    }

    this.drawParticles(1 / 60);
  }

  drawRake(rk, time) {
    const ctx = this.ctx;
    const k = this.cam.k;
    const foot = this.toScreen(rk.x, rk.y, 0);
    const head = this.toScreen(rk.x, rk.y, DROP_HEIGHT - 3);
    ctx.save();
    ctx.lineCap = 'round';
    // where it will land
    if (rk.state === 'ready') {
      ctx.setLineDash([4 * k, 4 * k]);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5 * k;
      ctx.beginPath(); ctx.ellipse(foot.sx, foot.sy, 16 * k, 16 * Y_SQUASH * k, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    // handle
    ctx.strokeStyle = '#4a2c16';
    ctx.lineWidth = 6 * k;
    ctx.beginPath(); ctx.moveTo(foot.sx + 14 * k, foot.sy + 2 * k); ctx.lineTo(head.sx, head.sy); ctx.stroke();
    ctx.strokeStyle = '#8b5a34';
    ctx.lineWidth = 3.5 * k;
    ctx.beginPath(); ctx.moveTo(foot.sx + 14 * k, foot.sy + 2 * k); ctx.lineTo(head.sx, head.sy); ctx.stroke();
    // head: a bar with tines hanging down
    const hw = 26 * k;
    ctx.strokeStyle = '#4a2c16';
    ctx.lineWidth = 4 * k;
    ctx.beginPath(); ctx.moveTo(head.sx - hw, head.sy); ctx.lineTo(head.sx + hw, head.sy); ctx.stroke();
    ctx.lineWidth = 2 * k;
    for (let i = -3; i <= 3; i++) { const x = head.sx + (i / 3) * hw; ctx.beginPath(); ctx.moveTo(x, head.sy); ctx.lineTo(x, head.sy + 9 * k); ctx.stroke(); }
    // active axis arrows
    if (rk.state === 'ready') {
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.9;
      const b = Math.sin(time * 10) * 1.5 * k;
      if (rk.held.x) { ctx.beginPath(); ctx.moveTo(head.sx + hw + 6 * k + b, head.sy - 6 * k); ctx.lineTo(head.sx + hw + 14 * k + b, head.sy); ctx.lineTo(head.sx + hw + 6 * k + b, head.sy + 6 * k); ctx.closePath(); ctx.fill(); }
      if (rk.held.y) { ctx.beginPath(); ctx.moveTo(head.sx - 6 * k, head.sy + 14 * k + b); ctx.lineTo(head.sx, head.sy + 22 * k + b); ctx.lineTo(head.sx + 6 * k, head.sy + 14 * k + b); ctx.closePath(); ctx.fill(); }
    }
    ctx.restore();
  }

  // ---------- effects ----------
  burst(x, y, z, color, n = 14, power = 120) {
    if (this.reduced) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = power * (0.4 + Math.random() * 0.8);
      this.particles.push({ x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, vz: 80 + Math.random() * power, life: 0.5 + Math.random() * 0.4, color, size: 2 + Math.random() * 3 });
    }
  }
  floatText(x, y, z, text, color = '#fff') {
    this.particles.push({ x, y, z, vx: 0, vy: 0, vz: 40, life: 1.0, text, color, size: 15, nog: true });
  }
  drawParticles(h) {
    const ctx = this.ctx;
    const k = this.cam.k;
    const alive = [];
    for (const p of this.particles) {
      p.life -= h;
      if (p.life <= 0) continue;
      p.x += p.vx * h; p.y += p.vy * h; p.z += p.vz * h;
      if (!p.nog) { p.vz -= 500 * h; if (p.z < 0) { p.z = 0; p.vz *= -0.4; p.vx *= 0.7; p.vy *= 0.7; } }
      const { sx, sy } = this.toScreen(p.x, p.y, p.z);
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 2);
      if (p.text) {
        ctx.font = `800 ${Math.round(p.size * k)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3 * k;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.strokeText(p.text, sx, sy);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, sx, sy);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(sx, sy, p.size * k, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      alive.push(p);
    }
    this.particles = alive;
  }

  // the "next" chip in the HUD
  static drawNext(canvas, level, time) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = canvas.clientWidth || 44;
    const hgt = canvas.clientHeight || 36;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr); }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    const L = LEVELS[level];
    drawSnail(ctx, SNAIL_STYLE, { x: w / 2 - 2, y: hgt - 6, facing: 1, color: L.color, scale: 0.62, t: time, walking: false });
  }
}

export { depthOf };
