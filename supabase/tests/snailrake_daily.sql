-- Dagens hög end to end with made-up players. Run with Supabase MCP
-- execute_sql (or the SQL editor). It always rolls back: the last line raises
-- on purpose, with "ALL OK" and a log when everything passed.
do $test$
declare
  a uuid := 'aaaaaaaa-0000-4000-8000-00000000000a';
  b uuid := 'bbbbbbbb-0000-4000-8000-00000000000b';
  j jsonb; d date := (now() at time zone 'utc')::date; seed_a int; log text := ''; failed boolean;
begin
  insert into auth.users (id, aud, role) values (a, 'authenticated', 'authenticated'), (b, 'authenticated', 'authenticated');

  -- 1: before starting, today's board shows no seed and no me
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  j := public.snailrake_daily_get(null);
  if j->>'code' <> 'daily:' || d::text or j->>'status' <> 'open' or j->'me' <> 'null'::jsonb or j::text like '%seed%' then raise exception 'get: %', j; end if;
  failed := false; begin perform public.snailrake_daily_get(d + 1); exception when others then failed := true; end;
  if not failed then raise exception 'tomorrow readable'; end if;
  log := log || 'no seed before start, no tomorrow; ';

  -- 2: start gives the seed; one try a day
  j := public.snailrake_daily_start('Anna');
  seed_a := (j->'me'->>'seed')::int;
  if seed_a is null or (j->>'duration')::int <> 180 then raise exception 'start: %', j; end if;
  failed := false; begin perform public.snailrake_daily_start('Anna'); exception when others then failed := sqlerrm like '%already played%'; end;
  if not failed then raise exception 'second try allowed'; end if;
  j := public.snailrake_daily_progress(d, 400, 180, 60, true);
  if not (j->'me'->>'done')::boolean or (j->'me'->>'rank')::int <> 1 then raise exception 'final: %', j; end if;
  failed := false; begin perform public.snailrake_daily_progress(d, 400, 200, 60, true); exception when others then failed := true; end;
  if not failed then raise exception 'time past three minutes accepted'; end if;
  log := log || 'seed on start, one try, final; ';

  -- 3: B gets the same seed, beats A, ranks and total follow
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  j := public.snailrake_daily_start('Bo');
  if (j->'me'->>'seed')::int <> seed_a then raise exception 'different seed for B'; end if;
  j := public.snailrake_daily_progress(d, 650, 120, 70, false);
  if (j->'me'->>'rank')::int <> 1 or (j->>'total')::int <> 2 or j->'entries'->1->>'name' <> 'Anna' then raise exception 'standings: %', j; end if;
  if j->'entries'->0->>'state' <> 'playing' then raise exception 'B should be playing: %', j->'entries'; end if;
  log := log || 'same seed, ranks, playing state; ';

  -- 4: a finished day is closed but readable
  update public.snailrake_daily set day = d - 1 where user_id = b and day = d;
  insert into public.snailrake_daily_seeds (day, seed) values (d - 1, 1) on conflict do nothing;
  j := public.snailrake_daily_get(d - 1);
  if j->>'status' <> 'closed' or (j->'me'->>'score')::int <> 650 then raise exception 'yesterday: %', j; end if;
  log := log || 'yesterday closed and readable';

  raise exception 'ALL OK (rolled back): %', log;
end $test$;
