// What Snigelkrattan's notices say. Shared by the edge function (Deno) and
// test/notify.test.mjs (Node), so plain JS with no imports.
export const GAME = 'https://snails.se/snailrake/';

export function title(lang) { return lang === 'en' ? 'Snail Rake' : 'Snigelkrattan'; }

function num(n, lang) { return Number(n).toLocaleString(lang === 'en' ? 'en-GB' : 'sv-SE'); }

// kind: 'beaten' | 'result' | 'rematch'; p: the queue row's params
export function body(kind, p, lang) {
  const en = lang === 'en';
  if (kind === 'beaten') {
    return en ? `${p.name} beat you with ${num(p.score, lang)} points in tournament ${p.code}.`
              : `${p.name} slog dig med ${num(p.score, lang)} poäng i turneringen ${p.code}.`;
  }
  if (kind === 'result') {
    if (p.rank === 1) {
      return en ? `Tournament ${p.code} is settled — you won with ${num(p.score, lang)}! 🏆`
                : `Turneringen ${p.code} är avgjord — du vann med ${num(p.score, lang)}! 🏆`;
    }
    return en ? `Tournament ${p.code} is settled: ${p.winner} won with ${num(p.winner_score, lang)}. You came #${p.rank} of ${p.total}.`
              : `Turneringen ${p.code} är avgjord: ${p.winner} vann med ${num(p.winner_score, lang)}. Du kom på plats ${p.rank} av ${p.total}.`;
  }
  if (kind === 'rematch') {
    return en ? `${p.name} wants a rematch! New tournament ${p.code}.`
              : `${p.name} vill ha revansch! Ny turnering ${p.code}.`;
  }
  return '';
}

export function payload(kind, p, lang) {
  return {
    title: title(lang),
    body: body(kind, p, lang),
    url: `${GAME}?t=${encodeURIComponent(p.code)}`,
    tag: `snailrake-${p.code}-${kind}`,
  };
}
