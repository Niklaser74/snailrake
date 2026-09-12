// UI strings in Swedish and English. Same pattern as the other snail games: t(key, params).
export const LANGS = { sv: 'Svenska', en: 'English' };

const dict = {
  sv: {
    'app.name': 'Snigelkrattan',
    'app.tagline': 'Du är trädgårdsmästaren. Krattan går bara åt ett håll per knapp, och lasten kryper.',
    'app.credit': 'Spelidé: Katie Norling',
    'app.by': 'En <a href="https://knackpot.se" target="_blank" rel="noopener">Knackpot</a>-produkt',
    'app.hub': 'Fler snigelspel på snails.se',
    'menu.start': 'Nytt spel', 'menu.continue': 'Fortsätt spelet', 'menu.help': 'Så spelar du', 'menu.install': 'Installera app',
    'menu.offline': 'Spelet är sparat för offline-spel.',
    'hud.score': 'Poäng', 'hud.best': 'Rekord', 'hud.next': 'Nästa',
    'btn.drop': 'Släpp', 'aria.x': 'Flytta krattan i sidled', 'aria.y': 'Flytta krattan framåt',
    'aria.mute': 'Ljud av', 'aria.unmute': 'Ljud på', 'aria.menu': 'Meny',
    'over.title': 'Gräsmattan är full',
    'over.tower3': 'Tre sniglar på varandra i tre sekunder. Ingen kröp av i tid.',
    'over.tower4': 'Fyra sniglar på varandra. Det håller inte.',
    'over.score': '{score} poäng', 'over.best': 'Rekord: {best}', 'over.newBest': 'Nytt rekord!',
    'over.again': 'Spela igen', 'over.menu': 'Till menyn',
    'help.title': 'Så spelar du',
    'help.1': '<b>Krattan</b> står i hörnet med nästa snigel. Håll ▶ för att köra den i sidled, ▼ för att köra framåt. Den går bara åt ett håll, och åker tillbaka till hörnet efter varje snigel. Långt bort kostar tid.',
    'help.2': '<b>Släpp</b> sätter ner snigeln där krattan är. Den kan landa snett, studsa, eller hamna ovanpå en annan. Dröjer du för länge kryper den av krattan själv — där den nu råkar vara.',
    'help.3': '<b>Likadana växer ihop.</b> En snigel kryper sakta mot närmaste snigel i samma färg och klättrar upp på den. Gul → grön → blå → lila → röd. Två röda försvinner och ger mest poäng.',
    'help.4': '<b>Tre på varandra</b> utan att någon matchar är fara: ringen börjar krympa. Den översta försöker krypa av — små hinner, stora hinner sällan. Fyra på varandra är slut direkt.',
    'help.5': '<b>Spelet sparas</b> av sig självt. Stäng och fortsätt senare, sniglarna väntar.',
    'help.close': 'Stäng',
  },
  en: {
    'app.name': 'Snail Rake',
    'app.tagline': 'You are the gardener. The rake only goes one way per button, and the cargo crawls.',
    'app.credit': 'Game design by Katie Norling',
    'app.by': 'A <a href="https://knackpot.se" target="_blank" rel="noopener">Knackpot</a> product',
    'app.hub': 'More snail games at snails.se',
    'menu.start': 'New game', 'menu.continue': 'Continue', 'menu.help': 'How to play', 'menu.install': 'Install app',
    'menu.offline': 'The game is saved for offline play.',
    'hud.score': 'Score', 'hud.best': 'Best', 'hud.next': 'Next',
    'btn.drop': 'Drop', 'aria.x': 'Move the rake sideways', 'aria.y': 'Move the rake forward',
    'aria.mute': 'Mute', 'aria.unmute': 'Unmute', 'aria.menu': 'Menu',
    'over.title': 'The lawn is full',
    'over.tower3': 'Three snails stacked for three seconds. Nobody crawled off in time.',
    'over.tower4': 'Four snails on top of each other. That will not hold.',
    'over.score': '{score} points', 'over.best': 'Best: {best}', 'over.newBest': 'New best!',
    'over.again': 'Play again', 'over.menu': 'Menu',
    'help.title': 'How to play',
    'help.1': '<b>The rake</b> waits in the corner with the next snail. Hold ▶ to drive it sideways, ▼ to drive it forward. It only goes one way, and returns to the corner after every snail. Far away costs time.',
    'help.2': '<b>Drop</b> puts the snail down where the rake is. It may land askew, bounce, or end up on top of another. Wait too long and it crawls off the rake by itself — wherever that happens to be.',
    'help.3': '<b>Same colour, same snail.</b> A snail slowly crawls to the nearest snail of its colour and climbs on to it. Yellow → green → blue → purple → red. Two reds vanish and score the most.',
    'help.4': '<b>Three stacked</b> with no match is danger: the ring starts to shrink. The top one tries to crawl off — small ones make it, big ones rarely do. Four stacked ends the game at once.',
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
