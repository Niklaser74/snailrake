# Supabase för Snigelkrattan

Samma projekt som de andra snigelspelen: **`snails`** (`lygpfumngyebxoqqncet`,
eu-north-1, Knackpot AB). Kontona delas; Snigelkrattan har eget tabellprefix
`snailrake_`. Projektfakta, auth-inställningar och hemligheter beskrivs i
snailmageddon-repots `supabase/README.md`.

## Vad som är vårt

| Objekt | Vad |
| --- | --- |
| `snailrake_best` | varje spelares bästa vanliga spel, genom tiderna |
| `snailrake_weekly` | varje spelares bästa per vecka (måndag, UTC) |
| `snailrake_submit/board/rename` | topplistan: skicka in, hämta topp 20 + egen placering, byt namn |
| `snailrake_tourneys` | en turnering: kod (5 tecken utan 0/O/1/I/L), värd, rundlängd 60/120/180/300 s, frö, `open`/`closed` |
| `snailrake_entries` | en deltagares runda: serverns `started_at`, poäng, `finished` |
| `snailrake_tourney_create/get/start/progress/close/mine` | turneringens hela API |
| `snailrake_cleanup` + cron `snailrake_cleanup` (04:47) | turneringar efter 30 dagar, veckorader efter ett år |

Allt är `security definer` med kontroll på `auth.uid()`; klienten når aldrig
tabellerna (RLS på, inga policyer, `revoke all`). Inga användar-id lämnar servern.

## Regler som servern håller

- **Rimlighet** (`snailrake_plausible`): poängen delbar med 5, högst 600 p/s
  (en headless-spelare som teleporterar krattan till bästa match toppar på ~220 p/s,
  `node scripts/measure-rate.mjs`), högst 4 släpp/s. Klienten är i övrigt betrodd.
- **Ett försök per turnering.** `start` skapar raden; finns den redan → `already played`.
- **Klockan är serverns.** Mellanställningar (var 10:e s) och slutpoäng godtas till
  `started_at + rundlängd + 90 s`. Därefter står senast rapporterade poäng.
  Poängen går bara uppåt, och `p_final` låser raden.
- **Fröt** visas bara för den som har startat — ingen kan öva på turneringens sniglar i förväg.
- `RULES_VERSION` (js/config.js) måste vara 1; höj båda om reglerna ändras så att gamla poäng inte går att jämföra.

## Migrationer

`migrations/*.sql` i filnamnsordning. Applicera med Supabase MCP
(`apply_migration`) eller SQL-editorn. **Kör inte `supabase db push` från
snailmageddon-repot** utan att först lägga till de här filerna i dess historik
(`supabase migration repair`).

## Test

`tests/snailrake.sql` körs med MCP `execute_sql`. Det rullar alltid tillbaka och
slutar med felet `ALL OK (rolled back): …` när allt gick igenom.
