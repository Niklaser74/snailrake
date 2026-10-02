-- Snigelpost for Snigelkrattan's tournaments: a deadline that settles the
-- tournament by itself, push when something happens, and a rematch.
--
-- The server decides who hears what: the RPCs put notices in
-- snailrake_push_queue, a cron job every minute settles tournaments past their
-- deadline and, when the queue is not empty, calls the edge function
-- snailrake-notify, which sends and empties it. Subscriptions live in a table of
-- our own (as in Snail Story), so a Snigelkrattan notice never reaches another
-- game's service worker on the shared origin. The VAPID key is the series'.

-- ---------- deadline and rematch ----------

alter table public.snailrake_tourneys
  add column open_hours int not null default 72 check (open_hours in (24, 72, 168)),
  add column closes_at timestamptz,
  add column rematch text;
update public.snailrake_tourneys set closes_at = created_at + interval '7 days' where closes_at is null;
alter table public.snailrake_tourneys alter column closes_at set not null;
create index snailrake_tourneys_due on public.snailrake_tourneys (closes_at) where status = 'open';

-- Open = no new rounds may start once the deadline has passed (or the host
-- closed it, which moves the deadline to now). 'closed' in the table means
-- settled: everyone's round is over and the results have gone out.
create or replace function public.snailrake_tourney_open(t public.snailrake_tourneys)
returns boolean language sql stable set search_path = public as $$
  select t.status = 'open' and now() < t.closes_at;
$$;

create or replace function public.snailrake_tourney_json(t public.snailrake_tourneys, uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', t.code, 'duration', t.duration_s,
    'status', case when public.snailrake_tourney_open(t) then 'open' else 'closed' end,
    'final', t.status = 'closed', 'closes_at', t.closes_at, 'hours', t.open_hours, 'rematch', t.rematch,
    'created_at', t.created_at, 'host', t.host = uid, 'now', now(),
    'me', (select jsonb_build_object('name', e.name, 'score', e.score, 'started_at', e.started_at,
                                     'done', public.snailrake_entry_done(e, t), 'seed', t.seed)
             from public.snailrake_entries e where e.tourney_id = t.id and e.user_id = uid),
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
                   'name', e.name, 'score', e.score, 'time', e.time_s, 'me', e.user_id = uid,
                   'state', case when public.snailrake_entry_done(e, t) then 'done' else 'playing' end)
                 order by e.score desc, e.updated_at)
               from public.snailrake_entries e where e.tourney_id = t.id), '[]'));
$$;

-- ---------- push: subscriptions and the queue ----------

create table public.snailrake_push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  lang       text,
  created_at timestamptz not null default now(),
  constraint snailrake_push_endpoint_len check (length(endpoint) < 2000),
  constraint snailrake_push_keys_len check (length(p256dh) < 200 and length(auth) < 100)
);
create index snailrake_push_user on public.snailrake_push_subscriptions (user_id);
alter table public.snailrake_push_subscriptions enable row level security;
revoke all on public.snailrake_push_subscriptions from anon, authenticated;

create table public.snailrake_push_queue (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users on delete cascade,
  kind       text not null check (kind in ('beaten', 'result', 'rematch')),
  params     jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.snailrake_push_queue enable row level security;
revoke all on public.snailrake_push_queue from anon, authenticated;

create or replace function public.snailrake_save_push(p_endpoint text, p_p256dh text, p_auth text, p_lang text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if (select count(*) from public.snailrake_push_subscriptions where user_id = auth.uid()) >= 10 then
    delete from public.snailrake_push_subscriptions where id in (
      select id from public.snailrake_push_subscriptions where user_id = auth.uid() order by created_at limit 1);
  end if;
  insert into public.snailrake_push_subscriptions (user_id, endpoint, p256dh, auth, lang)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_lang, 'sv'), 8))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang;
end $$;

create or replace function public.snailrake_remove_push(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.snailrake_push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- The edge function takes what is due in one statement (at most once), each
-- notice with the receiver's subscriptions.
create or replace function public.snailrake_take_push(p_limit int default 500)
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  with taken as (
    delete from public.snailrake_push_queue q
     where q.id in (select id from public.snailrake_push_queue order by id
                     limit greatest(1, least(coalesce(p_limit, 500), 1000)) for update skip locked)
    returning q.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', t.kind, 'params', t.params,
           'subs', coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'lang', s.lang))
                               from public.snailrake_push_subscriptions s where s.user_id = t.user_id), '[]'::jsonb))
         order by t.id), '[]'::jsonb)
    into out from taken t;
  return out;
end $$;

-- ---------- settling ----------

-- Settle one tournament if its deadline has passed and nobody is mid-round:
-- mark it closed and tell every player where they came. Returns true if settled.
create or replace function public.snailrake_tourney_settle(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare t public.snailrake_tourneys; n int; top public.snailrake_entries;
begin
  select * into t from public.snailrake_tourneys where id = p_id for update skip locked;
  if not found or t.status <> 'open' or now() < t.closes_at then return false; end if;
  if exists (select 1 from public.snailrake_entries e where e.tourney_id = t.id and not public.snailrake_entry_done(e, t)) then
    return false;   -- someone is still playing; the next tick will do it
  end if;
  update public.snailrake_tourneys set status = 'closed' where id = t.id;
  select count(*) into n from public.snailrake_entries where tourney_id = t.id;
  if n >= 2 then
    select * into top from public.snailrake_entries where tourney_id = t.id order by score desc, updated_at limit 1;
    insert into public.snailrake_push_queue (user_id, kind, params)
    select r.user_id, 'result', jsonb_build_object('code', t.code, 'rank', r.rank, 'total', n,
                                                   'winner', top.name, 'winner_score', top.score, 'score', r.score)
      from (select e.user_id, e.score, row_number() over (order by e.score desc, e.updated_at) as rank
              from public.snailrake_entries e where e.tourney_id = t.id) r;
  end if;
  return true;
end $$;

create or replace function public.snailrake_settle_due()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from public.snailrake_tourneys where status = 'open' and closes_at <= now() order by closes_at limit 200 loop
    if public.snailrake_tourney_settle(r.id) then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- ---------- the tournament API, with deadline, push and rematch ----------

-- Shared by create and rematch.
create or replace function public.snailrake_tourney_new(p_host uuid, p_duration int, p_hours int)
returns public.snailrake_tourneys language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text; t public.snailrake_tourneys; tries int := 0;
begin
  if p_duration is null or p_duration not in (60, 120, 180, 300) then raise exception 'bad duration'; end if;
  if p_hours is null or p_hours not in (24, 72, 168) then raise exception 'bad deadline'; end if;
  if (select count(*) from public.snailrake_tourneys where host = p_host and created_at > now() - interval '1 day') >= 30 then
    raise exception 'too many tournaments today';
  end if;
  loop
    c := '';
    for i in 1..5 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    begin
      insert into public.snailrake_tourneys (code, host, duration_s, seed, open_hours, closes_at)
      values (c, p_host, p_duration, floor(random() * 2147483647)::int, p_hours, now() + make_interval(hours => p_hours))
      returning * into t;
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 20 then raise; end if;
    end;
  end loop;
  return t;
end $$;

drop function public.snailrake_tourney_create(int);
create or replace function public.snailrake_tourney_create(p_duration int, p_hours int default 72)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  return public.snailrake_tourney_json(public.snailrake_tourney_new(uid, p_duration, p_hours), uid);
end $$;

create or replace function public.snailrake_tourney_start(p_code text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t public.snailrake_tourneys;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into t from public.snailrake_tourneys where code = upper(trim(p_code)) for update;
  if not found then raise exception 'no such tournament'; end if;
  if not public.snailrake_tourney_open(t) then raise exception 'tournament closed'; end if;
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

-- As before, plus: a finished round tells everyone it beat, and a round that
-- ends after the deadline may settle the tournament.
create or replace function public.snailrake_tourney_progress(p_code text, p_score int, p_time real, p_drops int, p_final boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t public.snailrake_tourneys; e public.snailrake_entries; ok boolean; final_score int;
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
    final_score := greatest(e.score, p_score);
    update public.snailrake_entries set
      score = final_score, time_s = greatest(time_s, p_time), drops = greatest(drops, p_drops),
      finished = coalesce(p_final, false),
      updated_at = case when p_score > score then now() else updated_at end
    where tourney_id = t.id and user_id = uid;
    if coalesce(p_final, false) and final_score > 0 then
      insert into public.snailrake_push_queue (user_id, kind, params)
      select o.user_id, 'beaten', jsonb_build_object('code', t.code, 'name', e.name, 'score', final_score)
        from public.snailrake_entries o
       where o.tourney_id = t.id and o.user_id <> uid and o.score < final_score
         and public.snailrake_entry_done(o, t);
      perform public.snailrake_tourney_settle(t.id);
      select * into t from public.snailrake_tourneys where id = t.id;
    end if;
  end if;
  return public.snailrake_tourney_json(t, uid) || jsonb_build_object('accepted', ok);
end $$;

-- The host closes: no new rounds from now, settled as soon as nobody is mid-round.
create or replace function public.snailrake_tourney_close(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t public.snailrake_tourneys;
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.snailrake_tourneys set closes_at = least(closes_at, now())
   where code = upper(trim(p_code)) and host = uid returning * into t;
  if not found then raise exception 'not your tournament'; end if;
  perform public.snailrake_tourney_settle(t.id);
  select * into t from public.snailrake_tourneys where id = t.id;
  return public.snailrake_tourney_json(t, uid);
end $$;

-- Rematch: same round length and deadline, new seed, the caller hosts. The
-- first press creates it and everyone else in the old one hears about it; any
-- later press (from anyone) lands in the same one.
create or replace function public.snailrake_tourney_rematch(p_code text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); old public.snailrake_tourneys; t public.snailrake_tourneys;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into old from public.snailrake_tourneys where code = upper(trim(p_code)) for update;
  if not found then raise exception 'no such tournament'; end if;
  if old.host <> uid and not exists (select 1 from public.snailrake_entries where tourney_id = old.id and user_id = uid) then
    raise exception 'not your tournament';
  end if;
  if old.rematch is not null then
    select * into t from public.snailrake_tourneys where code = old.rematch;
    if found then return public.snailrake_tourney_json(t, uid); end if;
  end if;
  if public.snailrake_tourney_open(old) then raise exception 'tournament still open'; end if;
  t := public.snailrake_tourney_new(uid, old.duration_s, old.open_hours);
  update public.snailrake_tourneys set rematch = t.code where id = old.id;
  insert into public.snailrake_push_queue (user_id, kind, params)
  select distinct p.user_id, 'rematch', jsonb_build_object('code', t.code, 'name', public.snailrake_clean_name(p_name))
    from (select user_id from public.snailrake_entries where tourney_id = old.id
          union select old.host) p
   where p.user_id <> uid;
  return public.snailrake_tourney_json(t, uid);
end $$;

create or replace function public.snailrake_tourney_mine()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', t.code, 'duration', t.duration_s,
           'status', case when public.snailrake_tourney_open(t) then 'open' else 'closed' end,
           'final', t.status = 'closed', 'closes_at', t.closes_at, 'created_at', t.created_at,
           'host', t.host = auth.uid(), 'now', now(),
           'players', (select count(*) from public.snailrake_entries e where e.tourney_id = t.id),
           'winner', (select e.name from public.snailrake_entries e where e.tourney_id = t.id
                       order by e.score desc, e.updated_at limit 1))
         order by t.created_at desc), '[]')
  from (select * from public.snailrake_tourneys t
         where t.host = auth.uid()
            or exists (select 1 from public.snailrake_entries e where e.tourney_id = t.id and e.user_id = auth.uid())
         order by t.created_at desc limit 10) t;
$$;

-- ---------- the clock: settle and send, every minute ----------

-- A random shared secret between the cron job and the edge function, made here
-- so it never appears in the repo.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'snailrake_cron_key')
 where not exists (select 1 from vault.secrets where name = 'snailrake_cron_key');

create or replace function public.snailrake_cron_key()
returns text language sql security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'snailrake_cron_key' limit 1;
$$;

create or replace function public.snailrake_tick()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.snailrake_settle_due();
  if exists (select 1 from public.snailrake_push_queue) then
    perform net.http_post(
      url := 'https://lygpfumngyebxoqqncet.supabase.co/functions/v1/snailrake-notify',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', public.snailrake_cron_key()),
      body := '{}'::jsonb,
      timeout_milliseconds := 25000);
  end if;
end $$;
select cron.schedule('snailrake_tick', '* * * * *', $$select public.snailrake_tick()$$);

-- housekeeping: notices nobody could deliver in a day are dropped
create or replace function public.snailrake_cleanup()
returns void language sql security definer set search_path = public as $$
  delete from public.snailrake_tourneys where created_at < now() - interval '30 days';
  delete from public.snailrake_weekly where week < (now() - interval '1 year')::date;
  delete from public.snailrake_daily where day < (now() - interval '90 days')::date;
  delete from public.snailrake_daily_seeds where day < (now() - interval '90 days')::date;
  delete from public.snailrake_push_queue where created_at < now() - interval '1 day';
$$;

-- ---------- grants ----------

do $$
declare f text;
begin
  foreach f in array array[
    'snailrake_tourney_create(int, int)', 'snailrake_tourney_rematch(text, text)',
    'snailrake_save_push(text, text, text, text)', 'snailrake_remove_push(text)'
  ] loop
    execute format('revoke execute on function public.%s from anon, public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array[
    'snailrake_tourney_open(public.snailrake_tourneys)', 'snailrake_tourney_new(uuid, int, int)',
    'snailrake_tourney_settle(uuid)', 'snailrake_settle_due()', 'snailrake_tick()', 'snailrake_cleanup()',
    'snailrake_tourney_json(public.snailrake_tourneys, uuid)'
  ] loop
    execute format('revoke execute on function public.%s from anon, authenticated, public', f);
  end loop;
  foreach f in array array['snailrake_take_push(int)', 'snailrake_cron_key()'] loop
    execute format('revoke execute on function public.%s from anon, authenticated, public', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
