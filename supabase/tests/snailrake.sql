-- The leaderboard and a tournament, end to end in the database with made-up
-- players. Run with Supabase MCP execute_sql (or the SQL editor). It always
-- rolls back: the last line raises on purpose, with "ALL OK" and a log when
-- everything passed, or the first failing check otherwise.
do $test$
declare
  a uuid := 'aaaaaaaa-0000-4000-8000-00000000000a';
  b uuid := 'bbbbbbbb-0000-4000-8000-00000000000b';
  c uuid := 'cccccccc-0000-4000-8000-00000000000c';
  j jsonb; tc text; log text := ''; failed boolean;
begin
  insert into auth.users (id, aud, role) values (a, 'authenticated', 'authenticated'), (b, 'authenticated', 'authenticated'), (c, 'authenticated', 'authenticated');

  -- 1: the leaderboard keeps the best, counts games, ranks
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  j := public.snailrake_submit(500, 120, 60, 'Anna', 1);
  if not (j->>'week_improved')::boolean or (j->>'week_rank')::int <> 1 then raise exception 'first submit: %', j; end if;
  j := public.snailrake_submit(300, 100, 50, 'Anna', 1);
  if (j->>'week_improved')::boolean or (j->>'week_best')::int <> 500 then raise exception 'worse game replaced the best: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  j := public.snailrake_submit(900, 150, 70, '  Bo' || chr(10), 1);
  -- (real players are on the boards too, so ranks are checked relative to Anna, not as absolutes)
  if (j->>'week_rank')::int >= (select count(*) + 1 from public.snailrake_weekly x where x.week = public.snailrake_week() and x.score > 500)
    then raise exception 'Bo should be above Anna: %', j; end if;
  j := public.snailrake_board('all');
  if (j->'me'->>'score')::int <> 900 or not exists (select 1 from jsonb_array_elements(j->'top') r where (r->>'me')::boolean and (r->>'score')::int = 900)
    then raise exception 'board: %', j; end if;
  if (select score from public.snailrake_best where user_id = a) <> 500 or (select games from public.snailrake_best where user_id = a) <> 2 then raise exception 'Anna row'; end if;
  log := log || 'best kept, ranks, board; ';

  -- 2: implausible scores and old rules are refused
  failed := false; begin perform public.snailrake_submit(99995, 10, 5, 'x', 1); exception when others then failed := true; end;
  if not failed then raise exception 'too fast a score was accepted'; end if;
  failed := false; begin perform public.snailrake_submit(502, 100, 5, 'x', 1); exception when others then failed := true; end;
  if not failed then raise exception 'a score not divisible by five was accepted'; end if;
  failed := false; begin perform public.snailrake_submit(500, 100, 5, 'x', 0); exception when others then failed := true; end;
  if not failed then raise exception 'old rules accepted'; end if;
  log := log || 'implausible refused; ';

  -- 3: rename shows on the board
  perform public.snailrake_rename('Bosse');
  if (select name from public.snailrake_best where user_id = b) <> 'Bosse' then raise exception 'rename'; end if;
  log := log || 'rename; ';

  -- 4: a tournament: create, start, progress, one try
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  j := public.snailrake_tourney_create(120);
  tc := j->>'code';
  if tc !~ '^[A-HJKMNP-Z2-9]{5}$' or not (j->>'host')::boolean or j->'me' <> 'null'::jsonb then raise exception 'create: %', j; end if;
  failed := false; begin perform public.snailrake_tourney_create(90); exception when others then failed := true; end;
  if not failed then raise exception 'odd duration accepted'; end if;
  j := public.snailrake_tourney_start(lower(tc), 'Anna');
  if (j->'me'->>'seed') is null or jsonb_array_length(j->'entries') <> 1 then raise exception 'start: %', j; end if;
  failed := false; begin perform public.snailrake_tourney_start(tc, 'Anna'); exception when others then failed := sqlerrm like '%already played%'; end;
  if not failed then raise exception 'second try allowed'; end if;
  j := public.snailrake_tourney_progress(tc, 200, 40, 20, false);
  if not (j->>'accepted')::boolean or j->'entries'->0->>'state' <> 'playing' then raise exception 'progress: %', j; end if;
  j := public.snailrake_tourney_progress(tc, 150, 50, 22, false);
  if (j->'me'->>'score')::int <> 200 then raise exception 'score went down: %', j; end if;
  failed := false; begin perform public.snailrake_tourney_progress(tc, 200, 125, 22, false); exception when others then failed := true; end;
  if not failed then raise exception 'time past the clock accepted'; end if;
  j := public.snailrake_tourney_progress(tc, 400, 120, 40, true);
  if not (j->'me'->>'done')::boolean or (j->'me'->>'score')::int <> 400 then raise exception 'final: %', j; end if;
  j := public.snailrake_tourney_progress(tc, 800, 120, 40, true);
  if (j->>'accepted')::boolean or (j->'me'->>'score')::int <> 400 then raise exception 'after final: %', j; end if;
  log := log || 'tourney one try, progress, final locks; ';

  -- 5: B joins, plays late: the last score before the deadline stands
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  j := public.snailrake_tourney_get(tc);
  if j->'me' <> 'null'::jsonb or (j->>'host')::boolean or j::text like '%seed%' then raise exception 'get before start leaks: %', j; end if;
  perform public.snailrake_tourney_start(tc, 'Bo');
  perform public.snailrake_tourney_progress(tc, 300, 60, 30, false);
  update public.snailrake_entries set started_at = now() - interval '10 minutes'
   where user_id = b and tourney_id = (select id from public.snailrake_tourneys where code = tc limit 1);
  j := public.snailrake_tourney_progress(tc, 900, 120, 60, true);
  if (j->>'accepted')::boolean or (j->'me'->>'score')::int <> 300 then raise exception 'late final counted: %', j; end if;
  if j->'entries'->0->>'name' <> 'Anna' or (j->'entries'->1->>'score')::int <> 300 then raise exception 'standings: %', j->'entries'; end if;
  failed := false; begin perform public.snailrake_tourney_close(tc); exception when others then failed := true; end;
  if not failed then raise exception 'a guest closed the tournament'; end if;
  log := log || 'late run keeps last score, guest cannot close; ';

  -- 6: the host closes; nobody new may start
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  j := public.snailrake_tourney_close(tc);
  if j->>'status' <> 'closed' then raise exception 'close: %', j; end if;
  j := public.snailrake_tourney_mine();
  if jsonb_array_length(j) < 1 or (j->0->>'players')::int <> 2 then raise exception 'mine: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  failed := false; begin perform public.snailrake_tourney_start(tc, 'Cilla'); exception when others then failed := sqlerrm like '%closed%'; end;
  if not failed then raise exception 'started in a closed tournament'; end if;
  log := log || 'close stops new starts, mine lists it';

  raise exception 'ALL OK (rolled back): %', log;
end $test$;
