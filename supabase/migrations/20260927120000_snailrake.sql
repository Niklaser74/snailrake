-- Snigelkrattan (snailrake): the global leaderboard and online tournaments.
-- Same project and pattern as the other snail games: prefix snailrake_, RLS on
-- with no policies, the client only reaches the tables through the
-- security-definer functions below. See supabase/README.md.

-- ---------- helpers ----------

-- Points per second no human reaches: a headless player that teleports the rake
-- over the best match peaks at ~220 p/s (scripts/measure-rate.mjs). All level
-- scores are multiples of five, and the rake reloads in 0.35 s.
create or replace function public.snailrake_plausible(p_score int, p_time real, p_drops int)
returns boolean language sql immutable set search_path = public as $$
  select p_score >= 0 and p_score % 5 = 0 and p_time >= 0 and p_drops >= 0
     and p_score <= 600 * greatest(p_time, 10)
     and p_drops <= 4 * p_time + 2;
$$;

create or replace function public.snailrake_clean_name(p_name text)
returns text language sql immutable set search_path = public as $$
  select left(coalesce(nullif(trim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g')), ''), 'Snigel'), 24);
$$;

-- the leaderboard week starts on Monday, UTC
create or replace function public.snailrake_week()
returns date language sql stable set search_path = public as $$
  select date_trunc('week', now() at time zone 'utc')::date;
$$;

-- ---------- leaderboard ----------

create table public.snailrake_best (
  user_id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  score int not null check (score >= 0),
  time_s real not null default 0,
  drops int not null default 0,
  games int not null default 1,
  updated_at timestamptz not null default now()
);
create index snailrake_best_rank on public.snailrake_best (score desc, updated_at);

create table public.snailrake_weekly (
  week date not null,
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  score int not null check (score >= 0),
  time_s real not null default 0,
  drops int not null default 0,
  games int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (week, user_id)
);
create index snailrake_weekly_rank on public.snailrake_weekly (week, score desc, updated_at);

alter table public.snailrake_best enable row level security;
alter table public.snailrake_weekly enable row level security;
revoke all on public.snailrake_best from anon, authenticated;
revoke all on public.snailrake_weekly from anon, authenticated;

-- One finished normal game. Keeps each player's best of the week and of all time.
create or replace function public.snailrake_submit(p_score int, p_time real, p_drops int, p_name text, p_rules_version int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  nm text := public.snailrake_clean_name(p_name);
  wk date := public.snailrake_week();
  prev_week int; prev_all int;
  w public.snailrake_weekly; b public.snailrake_best;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_rules_version is distinct from 1 then raise exception 'old rules, update the game'; end if;
  if not public.snailrake_plausible(p_score, p_time, p_drops) then raise exception 'implausible score'; end if;

  select score into prev_week from public.snailrake_weekly where week = wk and user_id = uid;
  select score into prev_all from public.snailrake_best where user_id = uid;

  insert into public.snailrake_weekly as t (week, user_id, name, score, time_s, drops)
  values (wk, uid, nm, p_score, p_time, p_drops)
  on conflict (week, user_id) do update set
    name = excluded.name, games = t.games + 1,
    score = greatest(t.score, excluded.score),
    time_s = case when excluded.score > t.score then excluded.time_s else t.time_s end,
    drops = case when excluded.score > t.score then excluded.drops else t.drops end,
    updated_at = case when excluded.score > t.score then now() else t.updated_at end
  returning * into w;

  insert into public.snailrake_best as t (user_id, name, score, time_s, drops)
  values (uid, nm, p_score, p_time, p_drops)
  on conflict (user_id) do update set
    name = excluded.name, games = t.games + 1,
    score = greatest(t.score, excluded.score),
    time_s = case when excluded.score > t.score then excluded.time_s else t.time_s end,
    drops = case when excluded.score > t.score then excluded.drops else t.drops end,
    updated_at = case when excluded.score > t.score then now() else t.updated_at end
  returning * into b;

  return jsonb_build_object(
    'score', p_score,
    'week_best', w.score, 'all_best', b.score,
    'week_improved', prev_week is null or p_score > prev_week,
    'all_improved', prev_all is null or p_score > prev_all,
    'week_rank', (select count(*) + 1 from public.snailrake_weekly x
                  where x.week = wk and (x.score > w.score or (x.score = w.score and x.updated_at < w.updated_at))),
    'week_total', (select count(*) from public.snailrake_weekly x where x.week = wk),
    'all_rank', (select count(*) + 1 from public.snailrake_best x
                 where x.score > b.score or (x.score = b.score and x.updated_at < b.updated_at)),
    'all_total', (select count(*) from public.snailrake_best));
end $$;

-- p_period: 'week' or 'all'. Top 20 plus the caller's own row and rank.
create or replace function public.snailrake_board(p_period text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  wk date := public.snailrake_week();
  top jsonb; me jsonb; total int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_period = 'week' then
    select coalesce(jsonb_agg(jsonb_build_object('name', r.name, 'score', r.score, 'me', r.user_id = uid)
                              order by r.score desc, r.updated_at), '[]')
      into top
      from (select * from public.snailrake_weekly where week = wk order by score desc, updated_at limit 20) r;
    select count(*) into total from public.snailrake_weekly where week = wk;
    select jsonb_build_object('name', m.name, 'score', m.score, 'games', m.games, 'rank',
             (select count(*) + 1 from public.snailrake_weekly x
               where x.week = wk and (x.score > m.score or (x.score = m.score and x.updated_at < m.updated_at))))
      into me from public.snailrake_weekly m where m.week = wk and m.user_id = uid;
  elsif p_period = 'all' then
    select coalesce(jsonb_agg(jsonb_build_object('name', r.name, 'score', r.score, 'me', r.user_id = uid)
                              order by r.score desc, r.updated_at), '[]')
      into top
      from (select * from public.snailrake_best order by score desc, updated_at limit 20) r;
    select count(*) into total from public.snailrake_best;
    select jsonb_build_object('name', m.name, 'score', m.score, 'games', m.games, 'rank',
             (select count(*) + 1 from public.snailrake_best x
               where x.score > m.score or (x.score = m.score and x.updated_at < m.updated_at)))
      into me from public.snailrake_best m where m.user_id = uid;
  else
    raise exception 'bad period';
  end if;
  return jsonb_build_object('period', p_period, 'week', wk, 'total', total, 'top', top, 'me', me);
end $$;

-- A new name shows at once on both boards.
create or replace function public.snailrake_rename(p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); nm text := public.snailrake_clean_name(p_name);
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.snailrake_best set name = nm where user_id = uid;
  update public.snailrake_weekly set name = nm where user_id = uid and week = public.snailrake_week();
  return jsonb_build_object('name', nm);
end $$;

-- ---------- tournaments ----------

create table public.snailrake_tourneys (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJKMNP-Z2-9]{5}$'),
  host uuid not null references auth.users on delete cascade,
  duration_s int not null check (duration_s in (60, 120, 180, 300)),
  seed int not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);
create index snailrake_tourneys_host on public.snailrake_tourneys (host, created_at desc);

create table public.snailrake_entries (
  tourney_id uuid not null references public.snailrake_tourneys on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  started_at timestamptz not null default now(),
  score int not null default 0 check (score >= 0),
  time_s real not null default 0,
  drops int not null default 0,
  finished boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (tourney_id, user_id)
);
create index snailrake_entries_user on public.snailrake_entries (user_id, started_at desc);

alter table public.snailrake_tourneys enable row level security;
alter table public.snailrake_entries enable row level security;
revoke all on public.snailrake_tourneys from anon, authenticated;
revoke all on public.snailrake_entries from anon, authenticated;

-- How long after the clock runs out a run may still report: a phone call, a
-- flaky connection. Past it the last reported score stands.
create or replace function public.snailrake_grace()
returns interval language sql immutable set search_path = public as $$ select interval '90 seconds' $$;

create or replace function public.snailrake_entry_done(e public.snailrake_entries, t public.snailrake_tourneys)
returns boolean language sql stable set search_path = public as $$
  select e.finished or now() > e.started_at + make_interval(secs => t.duration_s) + public.snailrake_grace();
$$;

-- The lobby: settings and standings. No user ids leave the server. The seed is
-- only shown to someone who has started (they need it to resume after a reload).
create or replace function public.snailrake_tourney_json(t public.snailrake_tourneys, uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', t.code, 'duration', t.duration_s, 'status', t.status, 'created_at', t.created_at,
    'host', t.host = uid, 'now', now(),
    'me', (select jsonb_build_object('name', e.name, 'score', e.score, 'started_at', e.started_at,
                                     'done', public.snailrake_entry_done(e, t), 'seed', t.seed)
             from public.snailrake_entries e where e.tourney_id = t.id and e.user_id = uid),
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
                   'name', e.name, 'score', e.score, 'time', e.time_s, 'me', e.user_id = uid,
                   'state', case when public.snailrake_entry_done(e, t) then 'done' else 'playing' end)
                 order by e.score desc, e.updated_at)
               from public.snailrake_entries e where e.tourney_id = t.id), '[]'));  -- at most 200, see start
$$;

create or replace function public.snailrake_tourney_create(p_duration int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text; t public.snailrake_tourneys; tries int := 0;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_duration is null or p_duration not in (60, 120, 180, 300) then raise exception 'bad duration'; end if;
  if (select count(*) from public.snailrake_tourneys where host = uid and created_at > now() - interval '1 day') >= 30 then
    raise exception 'too many tournaments today';
  end if;
  loop
    c := '';
    for i in 1..5 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    begin
      insert into public.snailrake_tourneys (code, host, duration_s, seed)
      values (c, uid, p_duration, floor(random() * 2147483647)::int)
      returning * into t;
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 20 then raise; end if;
    end;
  end loop;
  return public.snailrake_tourney_json(t, uid);
end $$;

create or replace function public.snailrake_tourney_get(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); t public.snailrake_tourneys;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into t from public.snailrake_tourneys where code = upper(trim(p_code));
  if not found then raise exception 'no such tournament'; end if;
  return public.snailrake_tourney_json(t, uid);
end $$;

-- One attempt: the run starts on the server's clock and cannot be restarted.
create or replace function public.snailrake_tourney_start(p_code text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t public.snailrake_tourneys;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into t from public.snailrake_tourneys where code = upper(trim(p_code)) for update;
  if not found then raise exception 'no such tournament'; end if;
  if t.status <> 'open' then raise exception 'tournament closed'; end if;
  if exists (select 1 from public.snailrake_entries where tourney_id = t.id and user_id = uid) then
    raise exception 'already played';
  end if;
  if (select count(*) from public.snailrake_entries where tourney_id = t.id) >= 200 then
    raise exception 'tournament full';
  end if;
  insert into public.snailrake_entries (tourney_id, user_id, name)
  values (t.id, uid, public.snailrake_clean_name(p_name));
  return public.snailrake_tourney_json(t, uid);
end $$;

-- Progress every few seconds and the final score. Scores only go up. After the
-- clock plus the grace the entry is locked and the last reported score stands.
create or replace function public.snailrake_tourney_progress(p_code text, p_score int, p_time real, p_drops int, p_final boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t public.snailrake_tourneys; e public.snailrake_entries; ok boolean;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into t from public.snailrake_tourneys where code = upper(trim(p_code));
  if not found then raise exception 'no such tournament'; end if;
  select * into e from public.snailrake_entries where tourney_id = t.id and user_id = uid for update;
  if not found then raise exception 'not started'; end if;
  if p_time > t.duration_s + 2 or not public.snailrake_plausible(p_score, p_time, p_drops) then
    raise exception 'implausible score';
  end if;
  ok := not public.snailrake_entry_done(e, t);
  if ok then
    update public.snailrake_entries set
      score = greatest(score, p_score), time_s = greatest(time_s, p_time), drops = greatest(drops, p_drops),
      finished = coalesce(p_final, false),
      updated_at = case when p_score > score then now() else updated_at end
    where tourney_id = t.id and user_id = uid;
  end if;
  return public.snailrake_tourney_json(t, uid) || jsonb_build_object('accepted', ok);
end $$;

create or replace function public.snailrake_tourney_close(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t public.snailrake_tourneys;
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.snailrake_tourneys set status = 'closed'
   where code = upper(trim(p_code)) and host = uid returning * into t;
  if not found then raise exception 'not your tournament'; end if;
  return public.snailrake_tourney_json(t, uid);
end $$;

-- The tournaments I host or have played, newest first, for getting back to a lobby.
create or replace function public.snailrake_tourney_mine()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', t.code, 'duration', t.duration_s, 'status', t.status, 'created_at', t.created_at,
           'host', t.host = auth.uid(),
           'players', (select count(*) from public.snailrake_entries e where e.tourney_id = t.id))
         order by t.created_at desc), '[]')
  from (select * from public.snailrake_tourneys t
         where t.host = auth.uid()
            or exists (select 1 from public.snailrake_entries e where e.tourney_id = t.id and e.user_id = auth.uid())
         order by t.created_at desc limit 10) t;
$$;

-- ---------- housekeeping ----------

create or replace function public.snailrake_cleanup()
returns void language sql security definer set search_path = public as $$
  delete from public.snailrake_tourneys where created_at < now() - interval '30 days';
  delete from public.snailrake_weekly where week < (now() - interval '1 year')::date;
$$;
select cron.schedule('snailrake_cleanup', '47 4 * * *', $$select public.snailrake_cleanup()$$);

-- ---------- grants ----------

do $$
declare f text;
begin
  foreach f in array array[
    'snailrake_submit(int, real, int, text, int)', 'snailrake_board(text)', 'snailrake_rename(text)',
    'snailrake_tourney_create(int)', 'snailrake_tourney_get(text)', 'snailrake_tourney_start(text, text)',
    'snailrake_tourney_progress(text, int, real, int, boolean)', 'snailrake_tourney_close(text)',
    'snailrake_tourney_mine()'
  ] loop
    execute format('revoke execute on function public.%s from anon, public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array[
    'snailrake_plausible(int, real, int)', 'snailrake_clean_name(text)', 'snailrake_week()',
    'snailrake_grace()', 'snailrake_entry_done(public.snailrake_entries, public.snailrake_tourneys)',
    'snailrake_tourney_json(public.snailrake_tourneys, uuid)', 'snailrake_cleanup()'
  ] loop
    execute format('revoke execute on function public.%s from anon, authenticated, public', f);
  end loop;
end $$;
