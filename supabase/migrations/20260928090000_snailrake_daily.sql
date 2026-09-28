-- Dagens hög: the same pile for everyone for a UTC day. One try of three
-- minutes, a board per day. Built like a tournament that the server owns: the
-- seed is drawn on the server the first time a day is asked for (so nobody can
-- work out tomorrow's pile), the clock is the server's, progress is reported
-- the same way. The lobby json has the tournament shape, with code 'daily:<day>'.

create table public.snailrake_daily_seeds (
  day date primary key,
  seed int not null
);

create table public.snailrake_daily (
  day date not null,
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  started_at timestamptz not null default now(),
  score int not null default 0 check (score >= 0),
  time_s real not null default 0,
  drops int not null default 0,
  finished boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (day, user_id)
);
create index snailrake_daily_rank on public.snailrake_daily (day, score desc, updated_at);

alter table public.snailrake_daily_seeds enable row level security;
alter table public.snailrake_daily enable row level security;
revoke all on public.snailrake_daily_seeds from anon, authenticated;
revoke all on public.snailrake_daily from anon, authenticated;

create or replace function public.snailrake_today()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'utc')::date;
$$;

-- three minutes, like the tournament default
create or replace function public.snailrake_daily_duration()
returns int language sql immutable set search_path = public as $$ select 180 $$;

create or replace function public.snailrake_daily_seed(p_day date)
returns int language plpgsql security definer set search_path = public as $$
declare s int;
begin
  insert into public.snailrake_daily_seeds (day, seed)
  values (p_day, floor(random() * 2147483647)::int)
  on conflict (day) do nothing;
  select seed into s from public.snailrake_daily_seeds where day = p_day;
  return s;
end $$;

create or replace function public.snailrake_daily_done(e public.snailrake_daily)
returns boolean language sql stable set search_path = public as $$
  select e.finished
      or now() > e.started_at + make_interval(secs => public.snailrake_daily_duration()) + public.snailrake_grace();
$$;

-- Top 20 of the day plus the caller's row and rank. The seed only goes to
-- someone who has started (they need it to resume after a reload).
create or replace function public.snailrake_daily_json(p_day date, uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', 'daily:' || p_day::text, 'day', p_day, 'duration', public.snailrake_daily_duration(),
    'status', case when p_day = public.snailrake_today() then 'open' else 'closed' end,
    'host', false, 'now', now(),
    'total', (select count(*) from public.snailrake_daily where day = p_day),
    'me', (select jsonb_build_object('name', e.name, 'score', e.score, 'started_at', e.started_at,
                                     'done', public.snailrake_daily_done(e),
                                     'seed', (select seed from public.snailrake_daily_seeds where day = p_day),
                                     'rank', (select count(*) + 1 from public.snailrake_daily x
                                               where x.day = p_day and (x.score > e.score or (x.score = e.score and x.updated_at < e.updated_at))))
             from public.snailrake_daily e where e.day = p_day and e.user_id = uid),
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
                   'name', r.name, 'score', r.score, 'time', r.time_s, 'me', r.user_id = uid,
                   'state', case when r.finished or now() > r.started_at + make_interval(secs => public.snailrake_daily_duration())
                                                          + public.snailrake_grace() then 'done' else 'playing' end)
                 order by r.score desc, r.updated_at)
               from (select * from public.snailrake_daily where day = p_day
                     order by score desc, updated_at limit 20) r), '[]'));
$$;

-- p_day null = today. Any past day may be read; the future may not.
create or replace function public.snailrake_daily_get(p_day date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); d date := coalesce(p_day, public.snailrake_today());
begin
  if uid is null then raise exception 'not signed in'; end if;
  if d > public.snailrake_today() then raise exception 'no such day'; end if;
  return public.snailrake_daily_json(d, uid);
end $$;

-- Today's one try, on the server's clock.
create or replace function public.snailrake_daily_start(p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); d date := public.snailrake_today();
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.snailrake_daily_seed(d);
  insert into public.snailrake_daily (day, user_id, name)
  values (d, uid, public.snailrake_clean_name(p_name))
  on conflict (day, user_id) do nothing;
  if not found then raise exception 'already played'; end if;
  return public.snailrake_daily_json(d, uid);
end $$;

-- p_day is the day the round started (a round may cross midnight).
create or replace function public.snailrake_daily_progress(p_day date, p_score int, p_time real, p_drops int, p_final boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); e public.snailrake_daily; ok boolean;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into e from public.snailrake_daily where day = p_day and user_id = uid for update;
  if not found then raise exception 'not started'; end if;
  if p_time > public.snailrake_daily_duration() + 2 or not public.snailrake_plausible(p_score, p_time, p_drops) then
    raise exception 'implausible score';
  end if;
  ok := not public.snailrake_daily_done(e);
  if ok then
    update public.snailrake_daily set
      score = greatest(score, p_score), time_s = greatest(time_s, p_time), drops = greatest(drops, p_drops),
      finished = coalesce(p_final, false),
      updated_at = case when p_score > score then now() else updated_at end
    where day = p_day and user_id = uid;
  end if;
  return public.snailrake_daily_json(p_day, uid) || jsonb_build_object('accepted', ok);
end $$;

-- housekeeping now also drops daily boards after 90 days
create or replace function public.snailrake_cleanup()
returns void language sql security definer set search_path = public as $$
  delete from public.snailrake_tourneys where created_at < now() - interval '30 days';
  delete from public.snailrake_weekly where week < (now() - interval '1 year')::date;
  delete from public.snailrake_daily where day < (now() - interval '90 days')::date;
  delete from public.snailrake_daily_seeds where day < (now() - interval '90 days')::date;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'snailrake_daily_get(date)', 'snailrake_daily_start(text)',
    'snailrake_daily_progress(date, int, real, int, boolean)'
  ] loop
    execute format('revoke execute on function public.%s from anon, public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array[
    'snailrake_today()', 'snailrake_daily_duration()', 'snailrake_daily_seed(date)',
    'snailrake_daily_done(public.snailrake_daily)', 'snailrake_daily_json(date, uuid)'
  ] loop
    execute format('revoke execute on function public.%s from anon, authenticated, public', f);
  end loop;
  execute 'revoke execute on function public.snailrake_cleanup() from anon, authenticated, public';
end $$;
