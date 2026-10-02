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
| `snailrake_tourney_create/get/start/progress/close/mine/rematch` | turneringens hela API |
| `snailrake_daily_seeds` | Dagens högs frö per UTC-dygn, lottat första gången dagen efterfrågas |
| `snailrake_daily` | en spelares runda på dagens hög, som `snailrake_entries` men nycklad på dag |
| `snailrake_daily_get/start/progress` | Dagens hög: samma svar-form som turneringen, med `code` = `daily:<dag>`, topp 20 + egen `rank` och `total` |
| `snailrake_daily_leader`, `snailrake_week_top` | **de enda som är öppna för anon**: dagens ledare och veckans topp 3 (namn, poäng, antal spelare), för hubbens kort (som aldrig skapar konton) |
| `snailrake_push_subscriptions`, `snailrake_save_push/remove_push` | Krattans egna push-prenumerationer (som Snail Story) — en Krattan-notis når aldrig ett annat spels service worker |
| `snailrake_push_queue`, `snailrake_take_push` | notiser som RPC:erna köar (`beaten`, `result`, `rematch`); edge-funktionen tömmer kön, högst en gång |
| `snailrake_tourney_settle`, `snailrake_settle_due` | avgör turneringar vars deadline passerat när ingen spelar längre, och köar resultaten |
| cron `snailrake_tick` (varje minut) | `snailrake_settle_due()`, sedan anrop till edge-funktionen om kön inte är tom |
| edge-funktion `snailrake-notify` | skickar köade notiser. `verify_jwt` av; bara cron-jobbet når den (`x-cron-key` = Vault-hemligheten `snailrake_cron_key`) |
| `snailrake_cleanup` + cron `snailrake_cleanup` (04:47) | turneringar efter 30 dagar, veckorader efter ett år, dagens hög efter 90 dagar |

Allt är `security definer`, och allt utom de två anon-funktionerna ovan kräver `auth.uid()`; klienten når aldrig
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
  Dagens hög lottar sitt frö på servern, så morgondagens hög går inte att räkna ut.
- **Deadline:** en turnering är öppen 24 h, 3 dygn eller en vecka (`open_hours`, `closes_at`). Värden som stänger
  flyttar bara deadline till nu. `status = 'closed'` betyder *avgjord*: deadline passerad och ingen mitt i en runda.
  Då köas `result` till alla (minst två spelare).
- **Notiser** bestäms av servern, aldrig av klienten: `beaten` till dem en avslutad runda gick förbi,
  `result` när turneringen avgörs, `rematch` till de andra när någon begär revansch (en gång per turnering).
- **Dagens hög:** 180 s, ett försök per UTC-dygn, samma klocka och grace som turneringen.
  `p_day` i progress är dagen rundan startade, så en runda över midnatt räknas till sin dag.
- `RULES_VERSION` (js/config.js) måste vara 1; höj båda om reglerna ändras så att gamla poäng inte går att jämföra.

## Edge-funktionen

`functions/snailrake-notify/`: `index.ts`, `texts.js` (notistexterna, testas i `test/notify.test.mjs`) och
`webpush.js` (kopia från snailmageddon — ändra där, kopiera hit).

```bash
supabase functions deploy snailrake-notify --no-verify-jwt --project-ref lygpfumngyebxoqqncet
```

eller MCP `deploy_edge_function` med de tre filerna och `verify_jwt: false`. Kolla att klockan går:

```sql
select jobname, schedule from cron.job where jobname = 'snailrake_tick';
select id, status_code, content from net._http_response order by id desc limit 3;
```

## Migrationer

`migrations/*.sql` i filnamnsordning. Applicera med Supabase MCP
(`apply_migration`) eller SQL-editorn. **Kör inte `supabase db push` från
snailmageddon-repot** utan att först lägga till de här filerna i dess historik
(`supabase migration repair`).

## Test

`tests/snailrake.sql`, `tests/snailrake_daily.sql` och `tests/snailrake_snigelpost.sql` körs med MCP `execute_sql`. Det rullar alltid tillbaka och
slutar med felet `ALL OK (rolled back): …` när allt gick igenom.
