// Web Push for the tournaments (Luffarsnigel's module, with Snigelkrattan's own
// subscription RPCs so our notices never reach another game's worker on the
// shared origin). The server decides what to send — see the snailrake_push_queue
// in supabase/ — so this only subscribes and unsubscribes this browser.
import { VAPID_PUBLIC_KEY } from './config.js';
import { online } from './supa.js';

function keyBytes(b64) {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const push = {
  supported() {
    return !!VAPID_PUBLIC_KEY && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  },
  // iOS only allows push for apps installed on the home screen
  needsInstall() {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    return ios && !standalone;
  },
  permission() { return typeof Notification === 'undefined' ? 'denied' : Notification.permission; },
  async current() {
    try { const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); } catch { return null; }
  },
  async subscribe(lang) {
    if (Notification.permission === 'default' && (await Notification.requestPermission()) !== 'granted') throw new Error('denied');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
    const j = sub.toJSON();
    await online.rpc('snailrake_save_push', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_lang: lang });
    return sub;
  },
  async unsubscribe() {
    const sub = await this.current();
    try { if (sub) await online.rpc('snailrake_remove_push', { p_endpoint: sub.toJSON().endpoint }); } catch { /* best effort */ }
    try { if (sub) await sub.unsubscribe(); } catch { /* best effort */ }
  },
  // Re-subscribe quietly when permission is granted but this scope (/snailrake/)
  // has no subscription — permission is per origin, subscriptions per worker.
  async resubscribe(lang) {
    try {
      if (!this.supported() || this.permission() !== 'granted' || this.needsInstall() || !online.userId()) return null;
      if (await this.current()) return null;
      return await this.subscribe(lang);
    } catch { return null; }
  },
};
