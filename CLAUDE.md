# Snigelkrattan

Tredje spelet i snigelserien på snails.se. Trädgårdsmästaren sätter ner sniglar
med en kratta som bara går åt ett håll per knapp; likadana växer ihop, tre på
varandra är slut. Spelidé: Katie Norling — krediteringen ska stå kvar i menyn.

Byggstegsfritt PWA: ES-moduler, Canvas, inga npm-beroenden. Bor på
`snails.se/snailrake/` under hubben (`Niklaser74/Niklaser74.github.io`).

## Kör

| Vad | Kommando |
| --- | --- |
| Lokal server | `npm start` → http://localhost:8083/ |
| Tester | `npm test` |
| Hämta renderare från Snäckmageddon | `npm run sync:game` (default `../dev-snailmageddon`) |
| Ikoner (SVG → PNG) | `npm run icons` (lånar hubbens Playwright) |
| Produktionslayout | i hubbrepot: `PORT=8081 node scripts/serve.mjs --mount /snailrake=../dev-krattan` |

## Struktur

```
js/engine.js    Garden: state, step(dt), spawn, poäng. Noll DOM — körs i Node
js/physics.js   gravitation, stöd/landning, glid-av, separation, väggar
js/merge.js     målval, krypning, tryMerge, stapeldjup, tornklockan
js/rake.js      krattans axlar, returen till hörnet, tålamodsklockan
js/levels.js    de fem nivåerna och den femte färgen (lila)
js/view.js      snedvyn: projektion, gräsmatta, kratta, sniglar via drawSnail, effekter
js/input.js     tre knappar med pointer capture + tangentbord
js/main.js      meny, loop, HUD, spara/fortsätt, ljud, PWA
js/i18n.js      sv/en
js/game/        KOPIOR från snailmageddon — rör aldrig, kör sync:game
test/           handrullade tester utan ramverk, node:assert
```

## Konventioner

- **Bara relativa sökvägar.** Allt på snails.se delar origin; `test/paths.test.mjs` vaktar.
  Enda absoluta är manifestets `id: "/snailrake/"`.
- **Egen namnrymd:** cache `snailrake-vN` i `sw.js`, `localStorage` `snailrake.*`, manifest-id `/snailrake/`.
- **Nya JS-filer läggs i `sw.js`** — `test/sw.test.mjs` säger till.
- **`engine.js`, `physics.js`, `merge.js`, `rake.js` importerar aldrig DOM, canvas eller `game/audio.js`.**
  Det är det som gör `test/engine.test.mjs` möjlig. Ljud och partiklar läses ur `garden.events`.
- **Mergevillkoret finns på ett ställe:** `tryMerge` anropas bara från `resolveSupport` när en
  snigel kommit till vila *direkt på* en annan. Inga grannregler.
- **Bara toppen i en stapel rör sig.** En snigel som bär en annan är frusen.
- All UI-text via `t()`, svenska och engelska samtidigt; `test/rules.test.mjs` kräver nyckelparitet.
- Svenska först i HTML, engelska via `data-i18n`.
- Tempo och balans är konstanter överst i `rake.js`, `merge.js`, `physics.js` — ändra där, inte inline.
- `docs-vault/` (Obsidian) och `.claude/` committas aldrig.

## Rör inte

- `js/game/*` — kopior. Ändra uppströms i snailmageddon och kör `npm run sync:game`.
- `manifest.id` — appens identitet på den delade originen.

## Innan du är klar

- `npm test` grönt.
- Bumpa `VERSION` i `sw.js` och `APP_VERSION` i `js/config.js` när något som skeppas ändrats.
- Push till `main` deployar direkt via Pages — titta på `npm start` först.
