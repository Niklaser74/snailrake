// Sends Snigelkrattan's tournament notices: "X beat you", "settled — you came
// #2", "X wants a rematch". The RPCs queue them in snailrake_push_queue; the
// cron job snailrake_tick calls this every minute while the queue is not empty.
// Only the cron job may call it: no JWT (deployed with verify_jwt off), a
// shared secret in x-cron-key instead, kept in Vault as snailrake_cron_key.
// Subscriptions are Snigelkrattan's own (snailrake_push_subscriptions); the
// VAPID key is the series' (snails_vapid_private).
import { sendPush, b64url, b64urlDecode } from './webpush.js';
import { payload } from './texts.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE = 'https://snails.se'; // also the VAPID subject: keep it the origin

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });

type Sub = { endpoint: string; p256dh: string; auth: string; lang: string | null };
type Notice = { kind: string; params: Record<string, unknown>; subs: Sub[] };

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  try {
    const expected = await (await rest('rpc/snailrake_cron_key', { method: 'POST', body: '{}' })).json();
    if (!expected || typeof expected !== 'string') return json({ error: 'cron key missing' }, 500);
    if (!sameSecret(req.headers.get('x-cron-key') || '', expected)) return json({ error: 'forbidden' }, 403);

    const due: Notice[] = await (await rest('rpc/snailrake_take_push', { method: 'POST', body: JSON.stringify({ p_limit: 500 }) })).json();
    if (!Array.isArray(due) || !due.length) return json({ due: 0, sent: 0 });

    const jwkText = await (await rest('rpc/snails_vapid_private', { method: 'POST', body: '{}' })).json();
    if (!jwkText) return json({ error: 'vapid key missing' }, 500);
    const jwk = typeof jwkText === 'string' ? JSON.parse(jwkText) : jwkText;
    const publicKey = b64url(new Uint8Array([4, ...b64urlDecode(jwk.x), ...b64urlDecode(jwk.y)]));
    const vapid = { publicKey, jwk };

    let sent = 0;
    const dead = new Set<string>();
    for (const n of due) {
      for (const s of n.subs || []) {
        const body = payload(n.kind, n.params, s.lang);
        const status = await sendPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, vapid, SITE).catch(() => 0);
        if (status === 200 || status === 201) sent++;
        else if (status === 404 || status === 410) dead.add(s.endpoint);
      }
    }
    for (const e of dead) await rest(`snailrake_push_subscriptions?endpoint=eq.${encodeURIComponent(e)}`, { method: 'DELETE' });
    return json({ due: due.length, sent, dead: dead.size });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
