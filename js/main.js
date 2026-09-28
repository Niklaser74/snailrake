// Snigelkrattan: menu, the frame loop, HUD, saving, sounds and the PWA plumbing.
// The rules live in engine.js and friends; this file only wires them to the page.
import { Garden } from './engine.js';
import { View } from './view.js';
import { bindInput } from './input.js';
import { LEVELS } from './levels.js';
import { t, setLang, detectLang, getLang } from './i18n.js';
import { setMuted, isMuted, unlockAudio, sfx } from './game/audio.js';
import { APP_VERSION } from './config.js';
import { net, normCode, cleanName, inviteLink, clock, errorKey, isDaily, DURATIONS, DEFAULT_DURATION, PROGRESS_EVERY, LOBBY_POLL } from './online.js';

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
let tourney = null;    // { code, duration } while a timed round is on the lawn: a tournament, or Dagens hög (code 'daily:<day>')
let reportedAt = 0;    // game time of the last tournament progress report
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
const OVERLAYS = ['menu', 'help', 'over', 'board', 'tourney', 'lobby'];
function paused() { return OVERLAYS.some((id) => !$(id).hidden) || document.hidden; }

$('btn-start').addEventListener('click', () => { newGame(); hideMenu(); });
$('btn-continue').addEventListener('click', () => { if (!running) resumeGame(); hideMenu(); });
$('btn-help').addEventListener('click', () => { $('help').hidden = false; });
$('btn-help-close').addEventListener('click', () => { $('help').hidden = true; });
$('btn-menu').addEventListener('click', () => { input.releaseAll(); save(); showMenu(); });
$('btn-again').addEventListener('click', () => {
  $('over').hidden = true;
  if (tourney) { const code = tourney.code; leaveTourney(); openLobby(code); } else newGame();
});
$('btn-over-board').addEventListener('click', () => { openBoard(); });
$('btn-over-menu').addEventListener('click', () => { $('over').hidden = true; if (tourney) leaveTourney(); showMenu(); });
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
    if (!$('board').hidden) { $('board').hidden = true; return; }
    if (!$('tourney').hidden) { $('tourney').hidden = true; return; }
    if (!$('lobby').hidden) { closeLobby(); showMenu(); return; }
    if (!$('over').hidden) return;
    if (tourney && running) return; // a tournament round cannot be paused
    if ($('menu').hidden) { input.releaseAll(); save(); showMenu(); } else if (running || store.get('game', null)) { $('btn-continue').click(); }
  }
});

// ---------- game ----------
function newGame({ seed = (Date.now() ^ (Math.random() * 0xffffffff)) | 0, timeLimit = 0 } = {}) {
  garden = new Garden({ seed, timeLimit });
  view.setWorld(garden.w, garden.h, garden.seed);
  view.particles = [];
  running = true;
  if (!tourney) store.del('game');
  showHud();
}
function showHud() {
  $('hud').hidden = false;
  $('pad').hidden = false;
  $('hud-time-stat').hidden = !tourney;
  $('btn-menu').hidden = !!tourney;
}
function resumeGame() {
  const saved = store.get('game', null);
  if (!saved) { newGame(); return; }
  try { garden = Garden.fromJSON(saved); } catch { newGame(); return; }
  view.setWorld(garden.w, garden.h, garden.seed);
  running = !garden.over;
  showHud();
}
function save() {
  if (!garden || !running) return;
  if (tourney) store.set('tgame', { code: tourney.code, garden: garden.toJSON() });
  else store.set('game', garden.toJSON());
}
let saveT = 0;

function handleEvents() {
  for (const e of garden.takeEvents()) {
    switch (e.type) {
      case 'drop': sfx.tick(); if (e.slipped) sfx.tickLow(); break;
      case 'land': if (e.hard) sfx.bounce(); break;
      case 'merge':
        sfx.crate();
        view.burst(e.x, e.y, LEVELS[e.level].color, 10 + e.level * 3, 90 + e.level * 25);
        view.floatText(e.x, e.y - 22, '+' + e.score, LEVELS[e.level].color);
        break;
      case 'pop':
        sfx.win();
        view.burst(e.x, e.y, LEVELS[e.level].color, 34, 220);
        view.burst(e.x, e.y, '#fff', 12, 160);
        view.floatText(e.x, e.y - 30, '+' + e.score, '#fff');
        break;
      case 'over': gameOver(e.reason); break;
      default: break;
    }
  }
}

function gameOver(reason) {
  running = false;
  input.releaseAll();
  sfx.sudden();
  const g = garden;
  $('over-title').textContent = t(reason === 'time' ? 'over.titleTime' : 'over.title');
  $('over-why').textContent = t('over.' + reason);
  $('over-score').textContent = t('over.score', { score: g.score });
  $('btn-again').textContent = t(!tourney ? 'over.again' : isDaily(tourney.code) ? 'over.toDaily' : 'over.toLobby');
  $('btn-over-board').hidden = !!tourney;
  $('over-rank').textContent = '';
  $('over-name').hidden = true;
  if (tourney) {
    store.del('tgame');
    $('over-best').textContent = '';
    $('over-best').classList.remove('new');
    const code = tourney.code;
    net.round.progress(code, g, true)
      .then((r) => { const p = placing(r); if (p && tourney?.code === code) $('over-rank').textContent = t(isDaily(code) ? 'over.rankDaily' : 'over.rankTourney', p); })
      .catch((e) => { if (tourney?.code === code) $('over-rank').textContent = t(errorKey(e)); });
  } else {
    store.del('game');
    const newBest = g.score > best;
    if (newBest) { best = g.score; store.set('best', best); }
    $('over-best').textContent = newBest ? t('over.newBest') : t('over.best', { best });
    $('over-best').classList.toggle('new', newBest);
    submitScore(g);
  }
  setTimeout(() => { $('over').hidden = false; }, 700);
}

// ---------- leaderboard ----------
function playerName() { return cleanName(store.get('name', '')); }
async function submitScore(g) {
  if (!net.available() || g.score <= 0) return;
  $('over-name').hidden = !!playerName();
  fillName($('over-name'));
  $('over-rank').textContent = t('over.sending');
  try {
    const r = await net.submit({ score: g.score, time: g.time, drops: g.drops }, playerName());
    $('over-rank').textContent = t(r.week_improved ? 'over.rankImproved' : 'over.rankWeek', { rank: r.week_rank, total: r.week_total });
  } catch (e) {
    $('over-rank').textContent = t(errorKey(e) === 'err.net' ? 'over.offline' : errorKey(e));
  }
}
let boardPeriod = 'week';
function openBoard() {
  $('board').hidden = false;
  fillName($('board').querySelector('[data-name-form]'));
  loadBoard();
}
async function loadBoard() {
  const period = boardPeriod;
  document.querySelectorAll('[data-period]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.period === period)));
  $('board-status').textContent = t('board.loading');
  $('board-me').textContent = '';
  try {
    await net.flushPending();
    const r = await net.board(period);
    if (period !== boardPeriod) return;
    renderList($('board-list'), r.top);
    $('board-status').textContent = r.top.length ? '' : t('board.empty');
    $('board-me').textContent = r.me ? t('board.me', { rank: r.me.rank, total: r.total, score: r.me.score }) : t('board.none');
  } catch (e) {
    if (period !== boardPeriod) return;
    $('board-list').replaceChildren();
    $('board-status').textContent = t(errorKey(e));
  }
}
document.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => { boardPeriod = b.dataset.period; loadBoard(); }));
$('btn-board').addEventListener('click', openBoard);
$('btn-board-close').addEventListener('click', () => { $('board').hidden = true; });

// One <li> per row; textContent only — the names come from other players.
function renderList(ol, rows) {
  ol.replaceChildren(...rows.map((row) => {
    const li = document.createElement('li');
    if (row.me) li.className = 'me';
    const n = document.createElement('span'); n.className = 'bname'; n.textContent = row.name;
    const tag = document.createElement('span'); tag.className = 'btag'; tag.textContent = row.tag || '';
    const sc = document.createElement('span'); sc.className = 'bscore'; sc.textContent = row.score;
    li.append(n, tag, sc);
    return li;
  }));
}

// The same name form sits in three panels; saving renames on the server too.
function fillName(form) { form.elements.name.value = playerName(); form.elements.name.placeholder = t('name.anon'); }
document.querySelectorAll('[data-name-form]').forEach((form) => form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = cleanName(form.elements.name.value);
  store.set('name', name);
  form.elements.name.blur();
  const status = form.nextElementSibling?.classList.contains('hint') ? form.nextElementSibling : null;
  try {
    if (net.signedIn()) await net.rename(name);
    if (status) status.textContent = t('name.saved');
    if (form.id === 'over-name') form.hidden = true;
    if (!$('board').hidden) loadBoard();
    if (!$('lobby').hidden) refreshLobby();
  } catch (err) { if (status) status.textContent = t(errorKey(err)); }
}));
// A first-time player takes the series profile name if they already have one.
if (!playerName() && net.available()) net.profileName().then((n) => { if (n && !playerName()) store.set('name', n); });

// ---------- tournaments ----------
let duration = store.get('tduration', DEFAULT_DURATION);
if (!DURATIONS.includes(duration)) duration = DEFAULT_DURATION;
function renderDurations() {
  $('t-durations').replaceChildren(...DURATIONS.map((d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t('tourney.min', { n: d / 60 });
    b.setAttribute('aria-pressed', String(d === duration));
    b.addEventListener('click', () => { duration = d; store.set('tduration', d); renderDurations(); });
    return b;
  }));
}
async function openTourneyPanel() {
  renderDurations();
  $('t-status').textContent = '';
  $('t-code').placeholder = t('tourney.code');
  $('tourney').hidden = false;
  $('t-mine-wrap').hidden = true;
  if (!net.signedIn()) return;
  try {
    const mine = await net.tourney.mine();
    $('t-mine').replaceChildren(...mine.map((m) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'link';
      b.textContent = t('tourney.mineRow', { code: m.code, min: m.duration / 60, players: m.players }) + (m.status === 'closed' ? ' · ' + t('tourney.closedTag') : '');
      b.addEventListener('click', () => { $('tourney').hidden = true; openLobby(m.code); });
      li.append(b);
      return li;
    }));
    $('t-mine-wrap').hidden = !mine.length;
  } catch { /* the list is a convenience */ }
}
$('btn-tourney').addEventListener('click', openTourneyPanel);
$('btn-daily').addEventListener('click', () => openLobby('daily'));
$('btn-t-close').addEventListener('click', () => { $('tourney').hidden = true; });
$('btn-t-create').addEventListener('click', async () => {
  $('t-status').textContent = t('board.loading');
  try {
    const r = await net.tourney.create(duration);
    $('tourney').hidden = true;
    openLobby(r.code, r);
  } catch (e) { $('t-status').textContent = t(errorKey(e)); }
});
$('t-join').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = normCode($('t-code').value);
  if (!code) { $('t-status').textContent = t('tourney.badCode'); return; }
  $('tourney').hidden = true;
  openLobby(code);
});

let lobby = null;      // the last lobby json from the server ({ code } until it arrives)
let lobbyTimer = 0;
function openLobby(code, data = null) {
  hideMenu();
  $('lobby').hidden = false;
  const daily = isDaily(code);
  $('l-title').textContent = t(daily ? 'daily.title' : 'tourney.title');
  $('l-code-label').textContent = t(daily ? 'daily.day' : 'tourney.code');
  $('l-code').classList.toggle('day', daily);
  $('l-code').textContent = daily ? '' : code;
  $('l-info').textContent = '';
  $('l-me').textContent = '';
  $('l-list').replaceChildren();
  $('btn-l-play').hidden = true;
  $('btn-l-end').hidden = true;
  $('btn-l-share').hidden = false;
  $('l-status').textContent = data ? '' : t('board.loading');
  lobby = data && data.code === code ? data : { code };
  fillName($('l-name'));
  if (data) renderLobby(); else refreshLobby();
  clearInterval(lobbyTimer);
  lobbyTimer = setInterval(() => { if (!$('lobby').hidden && !document.hidden) refreshLobby(); }, LOBBY_POLL);
}
function closeLobby() { $('lobby').hidden = true; clearInterval(lobbyTimer); lobby = null; }
async function refreshLobby() {
  const req = lobby;
  if (!req?.code) return;
  try {
    const r = await net.round.get(req.code);
    if (lobby !== req) return;   // closed, or another answer got there first
    lobby = r;
    $('l-status').textContent = '';
    renderLobby();
  } catch (e) {
    if (lobby !== req) return;
    if (errorKey(e) === 'err.noSuch' && localRound(req.code)) store.del('tgame');   // cleaned away on the server
    $('l-status').textContent = t(errorKey(e));
    if (!lobby.entries) $('btn-l-share').hidden = true;
  }
}
function placing(r) {
  if (r.me?.rank) return { rank: r.me.rank, total: r.total };   // Dagens hög: only the top 20 come back
  const i = (r.entries || []).findIndex((e) => e.me);
  return i < 0 ? null : { rank: i + 1, total: r.entries.length };
}
function localRound(code) { const s = store.get('tgame', null); return s && s.code === code ? s : null; }
function dayLabel(day) {
  try { return new Date(day + 'T12:00:00Z').toLocaleDateString(getLang() === 'sv' ? 'sv-SE' : 'en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }); } catch { return day; }
}
function renderLobby() {
  const r = lobby;
  const min = r.duration / 60;
  const daily = isDaily(r.code);
  if (daily) $('l-code').textContent = dayLabel(r.day);
  $('btn-l-share').hidden = r.status !== 'open' && !daily;
  const players = daily ? r.total : r.entries.length;
  $('l-info').textContent = t(daily ? 'daily.info' : r.status === 'open' ? 'tourney.info' : 'tourney.infoClosed', { min, players });
  renderList($('l-list'), r.entries.map((e) => ({ name: e.name, score: e.score, me: e.me, tag: e.state === 'playing' ? t('tourney.playing') : '' })));
  if (!r.entries.length) $('l-status').textContent = t(daily ? 'daily.empty' : 'tourney.empty');
  const me = r.me;
  const local = localRound(r.code);
  let play = null;
  if (!me) {
    $('l-me').textContent = r.status === 'open' ? t('tourney.meWaiting', { min }) : '';
    if (r.status === 'open') play = 'tourney.play';
  } else if (!me.done && local) {
    $('l-me').textContent = '';
    play = 'tourney.resume';
  } else if (!me.done) {
    $('l-me').textContent = t('tourney.elsewhere');
  } else {
    $('l-me').textContent = t('tourney.meDone', { score: me.score, ...placing(r) }) + (daily ? ' ' + t('daily.tomorrow') : '');
    if (local) store.del('tgame');
  }
  $('btn-l-play').hidden = !play;
  if (play) $('btn-l-play').textContent = t(play);
  $('l-name').hidden = !!me;
  $('btn-l-end').hidden = !(r.host && r.status === 'open');
}
$('btn-l-back').addEventListener('click', () => { closeLobby(); showMenu(); });
$('btn-l-share').addEventListener('click', async () => {
  const url = inviteLink(lobby.code);
  const text = !isDaily(lobby.code) ? t('tourney.shareText', { code: lobby.code })
    : lobby.me?.done ? t('daily.shareScore', { score: lobby.me.score }) : t('daily.shareText');
  try {
    if (navigator.share) { await navigator.share({ title: t('app.name'), text, url }); return; }
  } catch (e) { if (e?.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); $('l-status').textContent = t('tourney.copied'); } catch { $('l-status').textContent = url; }
});
$('btn-l-end').addEventListener('click', async () => {
  if (!confirm(t('tourney.endConfirm'))) return;
  try { lobby = await net.tourney.close(lobby.code); renderLobby(); } catch (e) { $('l-status').textContent = t(errorKey(e)); }
});
$('btn-l-play').addEventListener('click', async () => {
  const code = lobby.code;
  const local = localRound(code);
  if (lobby.me && local) {            // back into a round this device started
    let g;
    try { g = Garden.fromJSON(local.garden); } catch { store.del('tgame'); refreshLobby(); return; }
    beginTourney(code, g.timeLimit);
    garden = g;
    view.setWorld(garden.w, garden.h, garden.seed);
    view.particles = [];
    running = !garden.over;
    reportedAt = garden.time;
    showHud();
    return;
  }
  $('btn-l-play').disabled = true;
  $('l-status').textContent = t('board.loading');
  try {
    const r = await net.round.start(code, playerName());
    beginTourney(r.code, r.duration);
    newGame({ seed: r.me.seed, timeLimit: r.duration });
    save();
  } catch (e) {
    $('l-status').textContent = t(errorKey(e));
    refreshLobby();
  } finally { $('btn-l-play').disabled = false; }
});
function beginTourney(code, dur) {
  closeLobby();
  hideMenu();
  tourney = { code, duration: dur };
  reportedAt = 0;
}
function leaveTourney() {
  tourney = null;
  garden = null;
  running = false;
  $('hud').hidden = true;
  $('pad').hidden = true;
  $('btn-menu').hidden = false;
}
function reportProgress() {
  if (!tourney || !running || garden.time - reportedAt < PROGRESS_EVERY) return;
  reportedAt = garden.time;
  net.round.progress(tourney.code, garden, false).catch(() => { /* the next one, or the final, will do */ });
}


// ---------- input ----------
const input = bindInput({ left: $('btn-left'), right: $('btn-right'), drop: $('btn-drop') }, {
  axis(axis, on) { if (garden && running && !paused()) garden.rake.held[axis] = on; else if (garden) garden.rake.held[axis] = false; },
  drop() { if (garden && running && !paused()) { garden.drop(); if (navigator.vibrate) navigator.vibrate(8); } },
});

// ---------- HUD ----------
let lastNext = -1;
function refreshHud(time) {
  if (!garden) return;
  $('hud-score').textContent = garden.score;
  $('hud-best').textContent = Math.max(best, garden.score);
  if (tourney) {
    const left = garden.timeLimit - garden.time;
    $('hud-time').textContent = clock(left);
    $('hud-time-stat').classList.toggle('warn', left <= 15);
  }
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
      reportProgress();
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

// A shared ?t=CODE (or ?daily=1) link opens that lobby; so does a round this device left unfinished.
const params = new URLSearchParams(location.search);
const linked = params.has('daily') ? 'daily' : normCode(params.get('t'));
if (params.has('t') || params.has('daily')) {
  const u = new URL(location.href); u.searchParams.delete('t'); u.searchParams.delete('daily'); history.replaceState(null, '', u);
}
const openRound = store.get('tgame', null);
showMenu();
if (linked) openLobby(linked);
else if (openRound?.code) openLobby(openRound.code);
if (net.available() && net.signedIn()) net.flushPending();
