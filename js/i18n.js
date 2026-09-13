// UI strings in Swedish and English. Same pattern as the other snail games: t(key, params).
export const LANGS = { sv: 'Svenska', en: 'English' };

const dict = {
  sv: {
    'app.name': 'Snigelkrattan',
    'app.tagline': 'Du är trädgårdsmästaren. Släpp sniglar från krattan; likadana växer ihop, och högen får inte nå toppen.',
    'app.credit': 'Spelidé: Katie Norling',
    'app.by': 'En <a href="https://knackpot.se" target="_blank" rel="noopener">Knackpot</a>-produkt',
    'app.hub': 'Fler snigelspel på snails.se',
    'menu.start': 'Nytt spel', 'menu.continue': 'Fortsätt spelet', 'menu.help': 'Så spelar du', 'menu.install': 'Installera app',
    'menu.offline': 'Spelet är sparat för offline-spel.',
    'hud.score': 'Poäng', 'hud.best': 'Rekord', 'hud.next': 'Nästa',
    'btn.drop': 'Släpp', 'aria.left': 'Flytta krattan åt vänster', 'aria.right': 'Flytta krattan åt höger',
    'aria.mute': 'Ljud av', 'aria.unmute': 'Ljud på', 'aria.menu': 'Meny',
    'over.title': 'Högen nådde toppen',
    'over.top': 'En snigel låg stilla ovanför linjen i tre sekunder. Ingen kröp ner i tid.',
    'over.score': '{score} poäng', 'over.best': 'Rekord: {best}', 'over.newBest': 'Nytt rekord!',
    'over.again': 'Spela igen', 'over.menu': 'Till menyn',
    'help.title': 'Så spelar du',
    'help.1': '<b>Krattan</b> hänger över högen med nästa snigel. Håll ◀ eller ▶ för att köra den i sidled, <b>Släpp</b> låter snigeln falla. Den kan studsa, rulla, eller hamna ovanpå en annan.',
    'help.2': '<b>Dröj inte.</b> Håller du snigeln för länge på krattan kryper den av själv — där krattan nu råkar vara.',
    'help.3': '<b>Likadana växer ihop.</b> Landar en snigel rakt på en i samma färg blir de en större. Sniglar i högen kryper också sakta mot närmaste likadana och klättrar upp på den. Gul → grön → blå → lila → röd. Två röda försvinner och ger mest poäng.',
    'help.4': '<b>Högen får inte nå linjen.</b> Ligger en snigel stilla ovanför den börjar ringen krympa. Den försöker krypa ner mot en lägre del av högen — små hinner, stora sällan.',
    'help.5': '<b>Spelet sparas</b> av sig självt. Stäng och fortsätt senare, sniglarna väntar.',
    'help.close': 'Stäng',
  },
  en: {
    'app.name': 'Snail Rake',
    'app.tagline': 'You are the gardener. Drop snails from the rake; matches grow together, and the pile must not reach the top.',
    'app.credit': 'Game design by Katie Norling',
    'app.by': 'A <a href="https://knackpot.se" target="_blank" rel="noopener">Knackpot</a> product',
    'app.hub': 'More snail games at snails.se',
    'menu.start': 'New game', 'menu.continue': 'Continue', 'menu.help': 'How to play', 'menu.install': 'Install app',
    'menu.offline': 'The game is saved for offline play.',
    'hud.score': 'Score', 'hud.best': 'Best', 'hud.next': 'Next',
    'btn.drop': 'Drop', 'aria.left': 'Move the rake left', 'aria.right': 'Move the rake right',
    'aria.mute': 'Mute', 'aria.unmute': 'Unmute', 'aria.menu': 'Menu',
    'over.title': 'The pile reached the top',
    'over.top': 'A snail sat still above the line for three seconds. Nobody crawled down in time.',
    'over.score': '{score} points', 'over.best': 'Best: {best}', 'over.newBest': 'New best!',
    'over.again': 'Play again', 'over.menu': 'Menu',
    'help.title': 'How to play',
    'help.1': '<b>The rake</b> hangs over the pile with the next snail. Hold ◀ or ▶ to drive it sideways, <b>Drop</b> lets the snail fall. It may bounce, roll, or end up on top of another.',
    'help.2': '<b>Do not dawdle.</b> Hold the snail on the rake too long and it crawls off by itself — wherever the rake happens to be.',
    'help.3': '<b>Same colour, same snail.</b> A snail that lands straight on one of its colour becomes a bigger one. Snails in the pile also crawl slowly towards the nearest match and climb on to it. Yellow → green → blue → purple → red. Two reds vanish and score the most.',
    'help.4': '<b>The pile must not reach the line.</b> A snail resting above it starts the ring shrinking. It tries to crawl down towards a lower part of the pile — small ones make it, big ones rarely do.',
    'help.5': '<b>The game saves itself.</b> Close it and come back later, the snails will wait.',
    'help.close': 'Close',
  },
};

let lang = 'sv';
export function detectLang() {
  try {
    const saved = localStorage.getItem('snailrake.lang');
    if (saved && dict[saved]) return saved;
  } catch { /* private mode */ }
  const q = new URLSearchParams(location.search).get('lang');
  if (q && dict[q]) return q;
  return (navigator.language || 'sv').toLowerCase().startsWith('sv') ? 'sv' : 'en';
}
export function getLang() { return lang; }
export function setLang(l) {
  lang = dict[l] ? l : 'sv';
  try { localStorage.setItem('snailrake.lang', lang); } catch { /* ignore */ }
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.innerHTML = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
}
export function t(key, params = {}) {
  let s = dict[lang][key] ?? dict.sv[key] ?? key;
  for (const [k, v] of Object.entries(params)) s = s.replaceAll('{' + k + '}', String(v));
  return s;
}
export function keysOf(l) { return Object.keys(dict[l]); }
