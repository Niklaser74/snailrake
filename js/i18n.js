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
    'menu.tourney': 'Turnering', 'menu.board': 'Topplista',
    'hud.time': 'Tid',
    'over.titleTime': 'Tiden är ute', 'over.time': 'Klockan stannade. Poängen står sig.',
    'over.toLobby': 'Till turneringen',
    'over.rankWeek': 'Plats {rank} av {total} den här veckan', 'over.rankImproved': 'Nytt veckobästa — plats {rank} av {total}!',
    'over.rankTourney': 'Plats {rank} av {total} i turneringen hittills',
    'over.sending': 'Skickar till topplistan…', 'over.offline': 'Ingen anslutning — poängen skickas nästa gång.',
    'board.title': 'Topplista', 'board.week': 'Veckan', 'board.all': 'Alltid',
    'board.me': 'Du: plats {rank} av {total}, {score} poäng', 'board.none': 'Du finns inte på listan än — spela klart ett spel.',
    'board.empty': 'Ingen har spelat än. Bli först!', 'board.loading': 'Hämtar…',
    'name.label': 'Ditt namn på listorna', 'name.save': 'Spara', 'name.saved': 'Sparat.', 'name.anon': 'Snigel',
    'tourney.title': 'Turnering',
    'tourney.intro': 'Alla kör en runda lika länge, med samma sniglar i samma ordning. Ett försök var — flest poäng vinner.',
    'tourney.create': 'Starta en ny', 'tourney.createBtn': 'Skapa turnering', 'tourney.min': '{n} min',
    'tourney.join': 'Gå med', 'tourney.joinBtn': 'Gå med', 'tourney.codeHint': 'Fem tecken, t.ex. K7PXR',
    'tourney.badCode': 'Koden ska vara fem tecken.', 'tourney.mine': 'Dina turneringar',
    'tourney.mineRow': '{code} · {min} min · {players} spelare', 'tourney.closedTag': 'stängd',
    'tourney.code': 'Kod', 'tourney.info': '{min} min per runda · {players} spelare', 'tourney.infoClosed': '{min} min per runda · stängd',
    'tourney.share': 'Dela länken', 'tourney.copied': 'Länken är kopierad.',
    'tourney.shareText': 'Spela Snigelkrattan-turnering med mig! Kod {code}.',
    'tourney.play': 'Starta min runda', 'tourney.resume': 'Fortsätt min runda', 'tourney.end': 'Stäng turneringen',
    'tourney.endConfirm': 'Stänga turneringen? Ingen ny kan starta sin runda.',
    'tourney.empty': 'Ingen har spelat än. Dela koden!',
    'tourney.playing': 'spelar', 'tourney.you': 'du',
    'tourney.meDone': 'Du fick {score} poäng — plats {rank} av {total}.', 'tourney.meWaiting': 'Du har inte spelat än. Du har ett försök på {min} min.',
    'tourney.elsewhere': 'Din runda pågår på en annan enhet.',
    'err.played': 'Du har redan kört din runda i den här turneringen.', 'err.closed': 'Turneringen är stängd.',
    'err.noSuch': 'Hittar ingen turnering med den koden.', 'err.full': 'Turneringen är full.',
    'err.tooMany': 'Du har skapat många turneringar i dag. Försök i morgon.',
    'err.update': 'Uppdatera spelet för att vara med (ladda om sidan).', 'err.net': 'Kunde inte nå servern. Är du uppkopplad?',
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
    'menu.tourney': 'Tournament', 'menu.board': 'Leaderboard',
    'hud.time': 'Time',
    'over.titleTime': 'Time is up', 'over.time': 'The clock stopped. Your score stands.',
    'over.toLobby': 'Back to the tournament',
    'over.rankWeek': 'Rank {rank} of {total} this week', 'over.rankImproved': 'New weekly best — rank {rank} of {total}!',
    'over.rankTourney': 'Rank {rank} of {total} in the tournament so far',
    'over.sending': 'Sending to the leaderboard…', 'over.offline': 'No connection — the score goes next time.',
    'board.title': 'Leaderboard', 'board.week': 'This week', 'board.all': 'All time',
    'board.me': 'You: rank {rank} of {total}, {score} points', 'board.none': 'You are not on the board yet — finish a game.',
    'board.empty': 'Nobody has played yet. Be the first!', 'board.loading': 'Loading…',
    'name.label': 'Your name on the boards', 'name.save': 'Save', 'name.saved': 'Saved.', 'name.anon': 'Snail',
    'tourney.title': 'Tournament',
    'tourney.intro': 'Everyone plays one round of the same length, with the same snails in the same order. One try each — most points wins.',
    'tourney.create': 'Start a new one', 'tourney.createBtn': 'Create tournament', 'tourney.min': '{n} min',
    'tourney.join': 'Join', 'tourney.joinBtn': 'Join', 'tourney.codeHint': 'Five characters, e.g. K7PXR',
    'tourney.badCode': 'The code is five characters.', 'tourney.mine': 'Your tournaments',
    'tourney.mineRow': '{code} · {min} min · {players} players', 'tourney.closedTag': 'closed',
    'tourney.code': 'Code', 'tourney.info': '{min} min per round · {players} players', 'tourney.infoClosed': '{min} min per round · closed',
    'tourney.share': 'Share the link', 'tourney.copied': 'Link copied.',
    'tourney.shareText': 'Play a Snail Rake tournament with me! Code {code}.',
    'tourney.play': 'Start my round', 'tourney.resume': 'Continue my round', 'tourney.end': 'Close the tournament',
    'tourney.endConfirm': 'Close the tournament? Nobody new can start a round.',
    'tourney.empty': 'Nobody has played yet. Share the code!',
    'tourney.playing': 'playing', 'tourney.you': 'you',
    'tourney.meDone': 'You scored {score} — rank {rank} of {total}.', 'tourney.meWaiting': 'You have not played yet. You get one try of {min} min.',
    'tourney.elsewhere': 'Your round is running on another device.',
    'err.played': 'You have already played your round in this tournament.', 'err.closed': 'The tournament is closed.',
    'err.noSuch': 'No tournament with that code.', 'err.full': 'The tournament is full.',
    'err.tooMany': 'You have created a lot of tournaments today. Try tomorrow.',
    'err.update': 'Update the game to take part (reload the page).', 'err.net': 'Could not reach the server. Are you online?',
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
