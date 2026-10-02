// The online half of Snigelkrattan: the global leaderboard, tournaments and Dagens hög.
// Thin wrappers around the snailrake_* functions in Supabase (see
// supabase/migrations) plus the small pure helpers the page needs. The account
// itself is the series' shared one (supa.js → account.js); nothing here runs
// until the player opens a board, finishes a game or joins a tournament.
import { online } from './supa.js';
import { RULES_VERSION } from './config.js';

export const DURATIONS = [60, 120, 180, 300];   // seconds a tournament run may last
export const DEFAULT_DURATION = 180;
export const DEADLINES = [24, 72, 168];          // hours a tournament stays open before it settles by itself
export const DEFAULT_DEADLINE = 24;
export const PROGRESS_EVERY = 10;               // s of game time between tournament progress reports
export const LOBBY_POLL = 5000;                 // ms between standings refreshes in the lobby
const CODE_RE = /^[A-HJKMNP-Z2-9]{5}$/;         // no 0/O, 1/I/L: read aloud across a room

// ---------- pure helpers (tested in Node) ----------

// What someone typed or pasted → a code, or '' if it cannot be one.
export function normCode(s) {
  const c = String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return CODE_RE.test(c) ? c : '';
}
export function cleanName(s) {
  // eslint-disable-next-line no-control-regex
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24);
}
// Rounds are keyed by a string: a tournament code, or 'daily:YYYY-MM-DD' for
// Dagens hög ('daily' alone before the server has said which day it is).
export const isDaily = (key) => String(key).startsWith('daily');
export const dayOf = (key) => (/^daily:(\d{4}-\d{2}-\d{2})$/.exec(key) || [])[1] || null;

// The link to share: this page with ?t=CODE (or ?daily=1), so it works at any mount point.
export function inviteLink(code, loc = globalThis.location) {
  const q = isDaily(code) ? 'daily=1' : `t=${encodeURIComponent(code)}`;
  return `${loc.origin}${loc.pathname}?${q}`;
}
// Time left until a deadline, short and language-neutral: "2 d 3 h", "5 h 10 min", "4 min".
export function untilLabel(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), min = m % 60;
  if (d) return h ? `${d} d ${h} h` : `${d} d`;
  if (h) return min ? `${h} h ${min} min` : `${h} h`;
  return `${min} min`;
}
export function clock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
// Server messages → i18n keys; anything unexpected is a network problem to the player.
export function errorKey(e) {
  const m = String(e?.message || e || '');
  if (m.includes('already played')) return 'err.played';
  if (m.includes('tournament closed')) return 'err.closed';
  if (m.includes('no such tournament')) return 'err.noSuch';
  if (m.includes('tournament full')) return 'err.full';
  if (m.includes('too many')) return 'err.tooMany';
  if (m.includes('old rules')) return 'err.update';
  if (m.includes('still open')) return 'err.stillOpen';
  return 'err.net';
}

// ---------- the server ----------

const ls = {
  get(k, d) { try { const v = localStorage.getItem('snailrake.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('snailrake.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem('snailrake.' + k); } catch { /* ignore */ } },
};

export const net = {
  available: () => online.available(),
  signedIn: () => online.signedIn(),

  // The series profile name, if this browser already has an account — never creates one.
  async profileName() {
    if (!online.signedIn()) return '';
    try { return cleanName((await online.rpc('snails_profile'))?.name); } catch { return ''; }
  },

  board: (period) => online.rpc('snailrake_board', { p_period: period }),
  rename: (name) => online.rpc('snailrake_rename', { p_name: cleanName(name) }),

  // A finished normal game. If it cannot be sent now it waits in localStorage
  // (only the best waiting one is kept) and goes with the next flush.
  async submit(result, name) {
    const args = {
      p_score: result.score, p_time: Math.round(result.time * 10) / 10, p_drops: result.drops,
      p_name: cleanName(name), p_rules_version: RULES_VERSION,
    };
    try { return await online.rpc('snailrake_submit', args); } catch (e) {
      if (errorKey(e) === 'err.net') {
        const waiting = ls.get('pending', null);
        if (!waiting || waiting.p_score < args.p_score) ls.set('pending', args);
      }
      throw e;
    }
  },
  async flushPending() {
    const waiting = ls.get('pending', null);
    if (!waiting) return;
    try { await online.rpc('snailrake_submit', waiting); ls.del('pending'); } catch (e) { if (errorKey(e) !== 'err.net') ls.del('pending'); }
  },

  tourney: {
    create: (duration, hours) => online.rpc('snailrake_tourney_create', { p_duration: duration, p_hours: hours }),
    rematch: (code, name) => online.rpc('snailrake_tourney_rematch', { p_code: code, p_name: cleanName(name) }),
    get: (code) => online.rpc('snailrake_tourney_get', { p_code: code }),
    start: (code, name) => online.rpc('snailrake_tourney_start', { p_code: code, p_name: cleanName(name) }),
    progress: (code, g, final) => online.rpc('snailrake_tourney_progress', {
      p_code: code, p_score: g.score, p_time: Math.min(g.time, g.timeLimit || g.time), p_drops: g.drops, p_final: !!final,
    }, { keepalive: !!final }),
    close: (code) => online.rpc('snailrake_tourney_close', { p_code: code }),
    mine: () => online.rpc('snailrake_tourney_mine'),
  },

  daily: {
    get: (day) => online.rpc('snailrake_daily_get', { p_day: day }),
    start: (name) => online.rpc('snailrake_daily_start', { p_name: cleanName(name) }),
    progress: (day, g, final) => online.rpc('snailrake_daily_progress', {
      p_day: day, p_score: g.score, p_time: Math.min(g.time, g.timeLimit || g.time), p_drops: g.drops, p_final: !!final,
    }, { keepalive: !!final }),
  },

  // One door for both kinds of timed round, keyed as above.
  round: {
    get: (key) => (isDaily(key) ? net.daily.get(dayOf(key)) : net.tourney.get(key)),
    start: (key, name) => (isDaily(key) ? net.daily.start(name) : net.tourney.start(key, name)),
    progress: (key, g, final) => (isDaily(key) ? net.daily.progress(dayOf(key), g, final) : net.tourney.progress(key, g, final)),
  },
};
