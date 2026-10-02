// Bumped when the shipped files change, so the menu can show what is running.
// Keep it in step with the sw.js cache version.
export const APP_VERSION = 'v9';

// The series' Supabase project `snails` (shared by every game on snails.se).
// The publishable key is public by design; the tables are only reachable
// through the snailrake_* functions. Leave SUPABASE_URL empty to go offline-only.
export const SUPABASE_URL = 'https://lygpfumngyebxoqqncet.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_Nmes72jfyETXQZsiYjsokw_tMusjKI-';

// Bumped when a rule change makes old scores incomparable (the server checks it).
export const RULES_VERSION = 1;

// Web Push (VAPID) public key, the series' own; the private half is in Supabase Vault.
export const VAPID_PUBLIC_KEY = 'BG_p9tfa6FCNA-aqH4D0fiVfn0tnvLcwVYGtoAOA6NpDi-Mv6SojFcltzXZutx6GgAenDLeEe07dXve6iUS21mI';
