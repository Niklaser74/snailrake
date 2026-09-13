// The pile seen from the side, like a fish tank: the rake hangs over it, the
// snails fall, and whatever rests above the line is trouble. World (x, y) is
// screen-oriented already (y down), so drawing is a uniform scale and the
// side-view snail renderer from Snäckmageddon is used as is, foot at the bottom
// of the circle the physics sees.
import { drawSnail } from './game/snails.js';
import { THEMES } from './game/themes.js';
import { mulberry32 } from './game/rng.js';
import { LEVELS, SNAIL_STYLE } from './levels.js';
import { RAKE_Y, HOLD_WARN, HOLD_TIME } from './rake.js';
import { TOP_LINE, TOP_GRACE, POP_TIME } from './merge.js';

const SOIL = 14;              // world px of soil under the grass
const PAD = 8;
const FOOT = 0.92;            // the drawn foot sits this far down the circle

const theme = THEMES.garden;
const FLOWERS = ['#ff6b8a', '#c084fc', '#fff5cc', '#ffd166'];

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { k: 1, ox: 0, oy: 0 };
    this.w = 360;
    this.h = 600;
    this.seed = 1;
    this.back = null;
    this.particles = [];
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(canvas);
    this.layout();
  }

  setWorld(w, h, seed) { this.w = w; this.h = h; this.seed = seed; this.layout(); }

  layout() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.cw = Math.max(1, rect.width);
    this.ch = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.cw * dpr);
    this.canvas.height = Math.round(this.ch * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const contentW = this.w + PAD * 2;
    const contentH = this.h + SOIL + PAD * 2;
    const k = Math.min(this.cw / contentW, this.ch / contentH);
    this.cam.k = k;
    this.cam.ox = (this.cw - this.w * k) / 2;
    this.cam.oy = (this.ch - contentH * k) / 2 + PAD * k;
    this.paintBack();
  }

  toScreen(x, y) { return { sx: this.cam.ox + x * this.cam.k, sy: this.cam.oy + y * this.cam.k }; }

  // The tank: a sky wash, two low hedges as walls, grass and soil at the
  // bottom, a scatter of flowers on the grass line. Painted once per resize
  // with the garden's own seed so nothing dances between frames.
  paintBack() {
    const { k, ox, oy } = this.cam;
    const W = this.w * k;
    const Hh = this.h * k;
    const c = document.createElement('canvas');
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = Math.round(this.cw * dpr);
    c.height = Math.round(this.ch * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the board itself: a lighter pane of sky
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(ox, oy, W, Hh);
    // distant hills behind the pile
    g.fillStyle = theme.hills[1];
    g.globalAlpha = 0.35;
    g.beginPath();
    g.moveTo(ox, oy + Hh);
    for (let x = 0; x <= W; x += 4) g.lineTo(ox + x, oy + Hh * 0.72 + Math.sin(x / W * 5.2 + 1.3) * 22 * k + Math.sin(x / W * 13) * 6 * k);
    g.lineTo(ox + W, oy + Hh);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
    // soil, then grass on top of it
    const soil = g.createLinearGradient(0, oy + Hh, 0, oy + Hh + SOIL * k);
    soil.addColorStop(0, theme.soil[0]);
    soil.addColorStop(1, theme.soil[2]);
    g.fillStyle = soil;
    g.fillRect(ox - 2 * k, oy + Hh, W + 4 * k, SOIL * k);
    g.fillStyle = theme.edge[1];
    g.fillRect(ox - 2 * k, oy + Hh - 3 * k, W + 4 * k, 5 * k);
    // side hedges
    g.fillStyle = theme.edge[0];
    g.fillRect(ox - 3 * k, oy, 3 * k, Hh);
    g.fillRect(ox + W, oy, 3 * k, Hh);
    // grass tufts and flowers along the ground line
    const rng = mulberry32(this.seed);
    for (let i = 0; i < 26; i++) {
      const x = ox + rng() * W;
      const y = oy + Hh - 1;
      const r = (1.6 + rng() * 1.4) * k;
      if (rng() < 0.55) {
        g.strokeStyle = theme.edge[0];
        g.lineWidth = 1.2 * k;
        g.beginPath();
        for (let j = -1; j <= 1; j++) { g.moveTo(x, y); g.lineTo(x + j * 2 * k, y - (5 + rng() * 4) * k); }
        g.stroke();
        continue;
      }
      const fy = y - (5 + rng() * 3) * k;
      g.strokeStyle = theme.edge[0]; g.lineWidth = 1 * k;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, fy); g.stroke();
      g.fillStyle = FLOWERS[Math.floor(rng() * FLOWERS.length)];
      for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * r, fy + Math.sin(a) * r, r * 0.75, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#fff2a8';
      g.beginPath(); g.arc(x, fy, r * 0.6, 0, Math.PI * 2); g.fill();
    }
    this.back = c;
  }

  draw(g, time) {
    const ctx = this.ctx;
    const k = this.cam.k;
    ctx.clearRect(0, 0, this.cw, this.ch);
    if (this.back) ctx.drawImage(this.back, 0, 0, this.cw, this.ch);

    // the line the pile may not reach
    const line = this.toScreen(0, TOP_LINE);
    const danger = g.dangerTop != null;
    ctx.save();
    ctx.setLineDash([6 * k, 6 * k]);
    ctx.lineWidth = Math.max(1.5, 2 * k);
    ctx.strokeStyle = danger ? `rgba(226,69,60,${0.55 + Math.sin(time * 10) * 0.3})` : 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.moveTo(this.cam.ox, line.sy); ctx.lineTo(this.cam.ox + this.w * k, line.sy); ctx.stroke();
    ctx.restore();

    this.drawRake(g.rake, time);

    // soft shadows under everything on the ground, then the snails, lowest last so the front of the pile overlaps
    const list = g.snails.filter((s) => !s.dead);
    list.sort((a, b) => a.y - b.y || a.id - b.id);
    for (const s of list) {
      const L = LEVELS[s.level];
      let { sx, sy } = this.toScreen(s.x, s.y + s.r * FOOT);
      let scale = L.scale * k;
      let alpha = 1;
      if (s.state === 'popping') { const f = Math.max(0, s.popT / POP_TIME); alpha = f; scale *= 1 + (1 - f) * 0.7; }
      if (s.state === 'held' && g.rake.warning && !this.reduced) sx += Math.sin(time * 28) * 2.2 * k;
      ctx.save();
      ctx.globalAlpha = alpha;
      drawSnail(ctx, SNAIL_STYLE, {
        x: sx, y: sy, facing: s.facing, color: L.color, scale,
        t: time + s.seed * 9, walking: (s.state === 'crawling' || s.state === 'climbing') && !this.reduced,
      });
      ctx.restore();
    }

    // the snail in danger: a ring that shrinks with the grace clock
    if (danger) {
      const top = g.byId(g.dangerTop);
      if (top) {
        const { sx, sy } = this.toScreen(top.x, top.y);
        const frac = 1 - Math.min(1, g.dangerT / TOP_GRACE);
        const pulse = 1 + Math.sin(time * 12) * 0.05;
        const r = (top.r + 10) * k * pulse;
        ctx.save();
        ctx.lineWidth = 4 * k;
        ctx.strokeStyle = 'rgba(226,69,60,0.4)';
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#e2453c';
        ctx.beginPath(); ctx.arc(sx, sy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
        ctx.restore();
      }
    }

    // patience ring around the held snail once it starts to fidget
    const rk = g.rake;
    if (rk.state === 'ready' && rk.snail && rk.warning) {
      const s = rk.snail;
      const { sx, sy } = this.toScreen(s.x, s.y);
      const left = 1 - (rk.t - HOLD_WARN) / (HOLD_TIME - HOLD_WARN);
      const r = (s.r + 10) * k;
      ctx.save();
      ctx.lineWidth = 3.5 * k;
      ctx.strokeStyle = 'rgba(226,69,60,0.35)';
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#e2453c';
      ctx.beginPath(); ctx.arc(sx, sy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, left)); ctx.stroke();
      ctx.restore();
    }

    this.drawParticles(1 / 60);
  }

  drawRake(rk, time) {
    if (rk.state === 'off') return;
    const ctx = this.ctx;
    const k = this.cam.k;
    const head = this.toScreen(rk.x, RAKE_Y);
    const top = this.cam.oy - PAD * k - 4;
    ctx.save();
    ctx.lineCap = 'round';
    // where the snail will fall: a faint plumb line
    if (rk.state === 'ready' && rk.snail) {
      const s = rk.snail;
      ctx.setLineDash([3 * k, 6 * k]);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.5 * k;
      ctx.beginPath(); ctx.moveTo(head.sx, this.toScreen(0, s.y + s.r).sy + 4 * k); ctx.lineTo(head.sx, this.cam.oy + this.h * k); ctx.stroke();
      ctx.setLineDash([]);
    }
    // handle from above, bar with tines pointing down
    ctx.strokeStyle = '#4a2c16';
    ctx.lineWidth = 6 * k;
    ctx.beginPath(); ctx.moveTo(head.sx, top); ctx.lineTo(head.sx, head.sy); ctx.stroke();
    ctx.strokeStyle = '#8b5a34';
    ctx.lineWidth = 3.5 * k;
    ctx.beginPath(); ctx.moveTo(head.sx, top); ctx.lineTo(head.sx, head.sy); ctx.stroke();
    const hw = 24 * k;
    ctx.strokeStyle = '#4a2c16';
    ctx.lineWidth = 4 * k;
    ctx.beginPath(); ctx.moveTo(head.sx - hw, head.sy); ctx.lineTo(head.sx + hw, head.sy); ctx.stroke();
    ctx.lineWidth = 2 * k;
    for (let i = -3; i <= 3; i++) { const x = head.sx + (i / 3) * hw; ctx.beginPath(); ctx.moveTo(x, head.sy); ctx.lineTo(x, head.sy + 8 * k); ctx.stroke(); }
    // active direction arrow
    if (rk.state === 'ready' && (rk.held.left || rk.held.right)) {
      const dir = rk.held.right ? 1 : -1;
      const b = Math.sin(time * 10) * 1.5 * k;
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.9;
      const x0 = head.sx + dir * (hw + 6 * k + b);
      ctx.beginPath(); ctx.moveTo(x0, head.sy - 6 * k); ctx.lineTo(x0 + dir * 8 * k, head.sy); ctx.lineTo(x0, head.sy + 6 * k); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- effects ----------
  burst(x, y, color, n = 14, power = 120) {
    if (this.reduced) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = power * (0.4 + Math.random() * 0.8);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.5 + Math.random() * 0.4, color, size: 2 + Math.random() * 3 });
    }
  }
  floatText(x, y, text, color = '#fff') {
    this.particles.push({ x, y, vx: 0, vy: -40, life: 1.0, text, color, size: 15, nog: true });
  }
  drawParticles(dt) {
    const ctx = this.ctx;
    const k = this.cam.k;
    const alive = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (!p.nog) { p.vy += 500 * dt; if (p.y > this.h) { p.y = this.h; p.vy *= -0.4; p.vx *= 0.7; } }
      const { sx, sy } = this.toScreen(p.x, p.y);
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
