# Snigelkrattan / Snail Rake

Du är trädgårdsmästaren. Krattan hänger över högen med nästa snigel. Håll ◀
eller ▶ för att köra den i sidled, Släpp låter snigeln falla — den studsar,
rullar, eller hamnar ovanpå en annan. Dröjer du för länge kryper den av själv.

Landar en snigel rakt på en i samma färg blir de en större: gul → grön → blå
→ lila → röd. Två röda försvinner och ger mest poäng. Sniglar i högen kryper
också sakta mot närmaste likadana granne och klättrar upp på den. Högen får
inte nå linjen: ligger en snigel stilla ovanför den i några sekunder är det
slut — men den försöker krypa ner mot en lägre del av högen, så små sniglar
klarar sig och stora sällan.

**Spelidé: Katie Norling.** Tredje spelet i [snigelserien](https://snails.se)
från Knackpot. Live på [snails.se/snailrake/](https://snails.se/snailrake/).

## Kör

| Vad | Kommando |
| --- | --- |
| Lokal server | `npm start` → http://localhost:8083/ |
| Tester | `npm test` |
| Uppdatera `js/game/` från Snäckmageddon | `npm run sync:game` |
| Ikoner | `npm run icons` |

Byggstegsfritt: ren HTML, CSS och ES-moduler, inga beroenden. Hela repot
deployas till GitHub Pages vid push till `main`.

## Struktur

```
index.html            enda sidan: högen, HUD, tre knappar, meny, hjälp, game over
js/engine.js          spelets tillstånd och fasta tidssteg — körs i Node, inget DOM
js/physics.js         positionsbaserad cirkelfysik: gravitation, stöd, friktion, väggar
js/merge.js           krypning, klättring, matchning, topplinjen och räddningen
js/rake.js            krattan
js/levels.js          fem nivåer
js/view.js            sidovyn på canvas
js/input.js           knappar och tangentbord
js/main.js            meny, loop, spara, ljud, PWA
js/game/              kopior från snailmageddon: snigelritare, palett, ljud, RNG
test/                 paths, rules, engine, sw
```

## Så hänger det ihop

Ett spelvarv (`engine.js` → `step`) är: krattan, krypningen (kinematisk),
fysiken (förutsäg, lös överlapp några varv, läs tillbaka hastigheten — som
Suika), stödet (vem vilar på vem), topplinjen. Matchning sker på exakt ett
ställe — när en snigel kommer till vila direkt på en likadan, oavsett om den
föll dit eller klättrade. Bara ytan kryper; den som bär någon är frusen. Det
gör räddningen läsbar och motorn testbar.

Balansen ligger i konstanter överst i `rake.js`, `merge.js`, `physics.js`,
`levels.js` och `engine.js`. Sniglarna är stora med flit: med fem nivåer är en
röd bara sexton gula, så popparna dränerar högen fort — brädet är ~2,5 röda
brett för att en slarvig spelare ska förlora på några minuter.

## Sökvägar och origin

Spelet ligger på `snails.se/snailrake/`; hubben äger roten. Därför bara
relativa sökvägar, egen cache-prefix (`snailrake-`), egna `localStorage`-nycklar
(`snailrake.*`) och eget manifest-id (`/snailrake/`).

## Nästa steg

- Speltesta på telefon och sätt tempot (krattans fart, tålamodet, nådetiden, krypet).
- Leaderboard i Supabase `snails` (prefix `snailrake_`), delade konton med de andra spelen.
- Trädgårdsmästaren som figur vid krattan.
