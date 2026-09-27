// The online half of Snigelkrattan: the global leaderboard and tournaments.
// Thin wrappers around the snailrake_* functions in Supabase (see
// supabase/migrations) plus the small pure helpers the page needs. The account
// itself is the series' shared one (supa.js → account.js); nothing here runs
// until the player opens a board, finishes a game or joins a tournament.
import { online } from './supa.js';
import { RULES_VERSION } from './config.js';

export const DURATIONS = [60, 120, 180, 300];   // seconds a tournament run may last
export const DEFAULT_DURATION = 180;
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
// The link to share: this page with ?t=CODE, so it works at any mount point.
export function inviteLink(code, loc = globalThis.location) {
  return `${loc.origin}${loc.pathname}?t=${encodeURIComponent(code)}`;
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
    create: (duration) => online.rpc('snailrake_tourney_create', { p_duration: duration }),
    get: (code) => online.rpc('snailrake_tourney_get', { p_code: code }),
    start: (code, name) => online.rpc('snailrake_tourney_start', { p_code: code, p_name: cleanName(name) }),
    progress: (code, g, final) => online.rpc('snailrake_tourney_progress', {
      p_code: code, p_score: g.score, p_time: Math.min(g.time, g.timeLimit || g.time), p_drops: g.drops, p_final: !!final,
    }, { keepalive: !!final }),
    close: (code) => online.rpc('snailrake_tourney_close', { p_code: code }),
    mine: () => online.rpc('snailrake_tourney_mine'),
  },
};
