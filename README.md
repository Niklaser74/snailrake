# Snigelkrattan / Snail Rake

Du är trädgårdsmästaren. Nästa snigel sitter på krattan. Håll ▶ för att köra
krattan i sidled, ▼ för att köra framåt — den går bara åt ett håll, och åker
tillbaka till hörnet efter varje snigel. Släpp sätter ner snigeln där krattan
är. Dröjer du för länge kryper den av själv.

Sniglarna landar med fysik, kryper sakta mot närmaste snigel i samma färg och
klättrar upp på den: gul → grön → blå → lila → röd. Två röda försvinner och
ger mest poäng. Tre på varandra utan match i tre sekunder är slut — men den
översta försöker krypa av, så små sniglar klarar sig och stora sällan.

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
index.html            enda sidan: gräsmattan, HUD, tre knappar, meny, hjälp, game over
js/engine.js          spelets tillstånd och fasta tidssteg — körs i Node, inget DOM
js/physics.js         landning, stapling, glid-av, separation
js/merge.js           krypning, matchning, torn och räddning
js/rake.js            krattan
js/levels.js          fem nivåer
js/view.js            snedvyn på canvas
js/input.js           knappar och tangentbord
js/main.js            meny, loop, spara, ljud, PWA
js/game/              kopior från snailmageddon: snigelritare, palett, ljud, RNG
test/                 paths, rules, engine, sw
```

## Så hänger det ihop

Ett spelvarv är fyra saker i fast ordning (`engine.js` → `step`): krattan,
fallet, stödet (landa på gräset, på en annan snigel, eller glida av en kant),
krypningen, separationen, väggarna, tornklockan. Matchning sker på exakt ett
ställe — när en snigel kommer till vila direkt på en likadan. Bara toppen i en
stapel kryper; den som bär någon är frusen. Det gör räddningen läsbar och
motorn testbar.

## Sökvägar och origin

Spelet ligger på `snails.se/snailrake/`; hubben äger roten. Därför bara
relativa sökvägar, egen cache-prefix (`snailrake-`), egna `localStorage`-nycklar
(`snailrake.*`) och eget manifest-id (`/snailrake/`).

## Nästa steg

- Speltesta på telefon och sätt tempot (krattans fart, tålamodet, nådetiden).
- Leaderboard i Supabase `snails` (prefix `snailrake_`), delade konton med de andra spelen.
- Trädgårdsmästaren som figur vid krattan.
