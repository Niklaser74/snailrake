// Snigelkrattan: menu, the frame loop, HUD, saving, sounds and the PWA plumbing.
// The rules live in engine.js and friends; this file only wires them to the page.
import { Garden } from './engine.js';
import { View } from './view.js';
import { bindInput } from './input.js';
import { LEVELS } from './levels.js';
import { t, setLang, detectLang } from './i18n.js';
import { setMuted, isMuted, unlockAudio, sfx } from './game/audio.js';
import { APP_VERSION } from './config.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('snailrake.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('snailrake.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem('snailrake.' + k); } catch { /* ignore */ } },
};

setLang(detectLang());
document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));

let garden = null;
let running = false;   // a game exists and is not over
let best = store.get('best', 0);
const view = new View($('lawn'));

// ---------- menu ----------
function showMenu() {
  $('btn-continue').hidden = !(running || store.get('game', null));
  $('menu').hidden = false;
  $('menu-version').textContent = APP_VERSION;
  refreshMute();
}
function hideMenu() { $('menu').hidden = true; }
function paused() { return !$('menu').hidden || !$('help').hidden || !$('over').hidden || document.hidden; }

$('btn-start').addEventListener('click', () => { newGame(); hideMenu(); });
$('btn-continue').addEventListener('click', () => { if (!running) resumeGame(); hideMenu(); });
$('btn-help').addEventListener('click', () => { $('help').hidden = false; });
$('btn-help-close').addEventListener('click', () => { $('help').hidden = true; });
$('btn-menu').addEventListener('click', () => { input.releaseAll(); save(); showMenu(); });
$('btn-again').addEventListener('click', () => { $('over').hidden = true; newGame(); });
$('btn-over-menu').addEventListener('click', () => { $('over').hidden = true; showMenu(); });
$('btn-mute').addEventListener('click', () => { setMuted(!isMuted()); store.set('muted', isMuted()); refreshMute(); });
function refreshMute() {
  const m = isMuted();
  $('btn-mute').textContent = m ? '🔇' : '🔊';
  $('btn-mute').setAttribute('aria-label', t(m ? 'aria.unmute' : 'aria.mute'));
}
setMuted(!!store.get('muted', false));
addEventListener('pointerdown', unlockAudio, { once: true });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('help').hidden) { $('help').hidden = true; return; }
    if (!$('over').hidden) return;
    if ($('menu').hidden) { input.releaseAll(); save(); showMenu(); } else if (running || store.get('game', null)) { $('btn-continue').click(); }
  }
});

// ---------- game ----------
function newGame() {
  garden = new Garden({ seed: (Date.now() ^ (Math.random() * 0xffffffff)) | 0 });
  view.setWorld(garden.w, garden.d, garden.seed);
  view.particles = [];
  running = true;
  store.del('game');
  $('hud').hidden = false;
  $('pad').hidden = false;
}
function resumeGame() {
  const saved = store.get('game', null);
  if (!saved) { newGame(); return; }
  try { garden = Garden.fromJSON(saved); } catch { newGame(); return; }
  view.setWorld(garden.w, garden.d, garden.seed);
  running = !garden.over;
  $('hud').hidden = false;
  $('pad').hidden = false;
}
function save() {
  if (!garden || !running) return;
  store.set('game', garden.toJSON());
}
let saveT = 0;

function handleEvents() {
  for (const e of garden.takeEvents()) {
    switch (e.type) {
      case 'drop': sfx.tick(); if (e.slipped) sfx.tickLow(); break;
      case 'land': if (e.hard) sfx.bounce(); break;
      case 'slip': sfx.tickLow(); break;
      case 'merge':
        sfx.crate();
        view.burst(e.x, e.y, e.z + 8, LEVELS[e.level].color, 10 + e.level * 3, 90 + e.level * 25);
        view.floatText(e.x, e.y, e.z + 30, '+' + e.score, LEVELS[e.level].color);
        break;
      case 'pop':
        sfx.win();
        view.burst(e.x, e.y, e.z + 10, LEVELS[e.level].color, 34, 220);
        view.burst(e.x, e.y, e.z + 10, '#fff', 12, 160);
        view.floatText(e.x, e.y, e.z + 40, '+' + e.score, '#fff');
        break;
      case 'over': gameOver(e.reason); break;
      default: break;
    }
  }
}

function gameOver(reason) {
  running = false;
  input.releaseAll();
  store.del('game');
  sfx.sudden();
  const newBest = garden.score > best;
  if (newBest) { best = garden.score; store.set('best', best); }
  $('over-why').textContent = t('over.' + reason);
  $('over-score').textContent = t('over.score', { score: garden.score });
  $('over-best').textContent = newBest ? t('over.newBest') : t('over.best', { best });
  $('over-best').classList.toggle('new', newBest);
  setTimeout(() => { $('over').hidden = false; }, 700);
}

// ---------- input ----------
const input = bindInput({ x: $('btn-x'), y: $('btn-y'), drop: $('btn-drop') }, {
  axis(axis, on) { if (garden && running && !paused()) garden.rake.held[axis] = on; else if (garden) garden.rake.held[axis] = false; },
  drop() { if (garden && running && !paused()) { garden.drop(); if (navigator.vibrate) navigator.vibrate(8); } },
});

// ---------- HUD ----------
let lastNext = -1;
function refreshHud(time) {
  if (!garden) return;
  $('hud-score').textContent = garden.score;
  $('hud-best').textContent = Math.max(best, garden.score);
  if (garden.next !== lastNext) { lastNext = garden.next; View.drawNext($('hud-next'), garden.next, time); }
}

// ---------- loop ----------
let last = 0;
function frame(ts) {
  const dt = Math.min(0.1, last ? (ts - last) / 1000 : 0);
  last = ts;
  if (garden) {
    if (running && !paused()) {
      garden.advance(dt);
      handleEvents();
      saveT += dt;
      if (saveT > 2) { saveT = 0; save(); }
    }
    view.draw(garden, ts / 1000);
    refreshHud(ts / 1000);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('visibilitychange', () => { if (document.hidden) { input.releaseAll(); save(); } });
addEventListener('pagehide', save);

// ---------- PWA ----------
let deferredPrompt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; $('btn-install').hidden = false; });
$('btn-install').addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('btn-install').hidden = true; });
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(() => { $('offline-hint').textContent = t('menu.offline'); }).catch(() => {});
  });
}

// for browser tests and debugging
window.snailrake = { get garden() { return garden; }, get view() { return view; }, get running() { return running; }, newGame };

showMenu();
