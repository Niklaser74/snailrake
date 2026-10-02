-- Snigelpost for the tournaments: deadline, settling, notices, rematch. Run
-- with Supabase MCP execute_sql. It always rolls back: the last line raises on
-- purpose, with "ALL OK" and a log when everything passed.
do $test$
declare
  a uuid := 'aaaaaaaa-0000-4000-8000-00000000000a';
  b uuid := 'bbbbbbbb-0000-4000-8000-00000000000b';
  c uuid := 'cccccccc-0000-4000-8000-00000000000c';
  j jsonb; tc text; tid uuid; rc text; log text := ''; failed boolean; q jsonb;
begin
  insert into auth.users (id, aud, role) values (a, 'authenticated', 'authenticated'), (b, 'authenticated', 'authenticated'), (c, 'authenticated', 'authenticated');
  delete from public.snailrake_push_queue;   -- rolled back; only this test's notices count

  -- 1: create with a deadline
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  j := public.snailrake_tourney_create(120, 24);
  tc := j->>'code'; select id into tid from public.snailrake_tourneys where code = tc;
  if (j->>'hours')::int <> 24 or j->>'status' <> 'open' or (j->>'final')::boolean
     or (j->>'closes_at')::timestamptz not between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute' then
    raise exception 'create: %', j;
  end if;
  failed := false; begin perform public.snailrake_tourney_create(120, 5); exception when others then failed := true; end;
  if not failed then raise exception 'odd deadline accepted'; end if;
  if (public.snailrake_tourney_create(180)->>'hours')::int <> 72 then raise exception 'default deadline is not 72 h'; end if;
  log := log || 'deadline; ';

  -- 2: A plays 300, B beats A with 500 -> A hears "beaten"
  perform public.snailrake_tourney_start(tc, 'Anna');
  perform public.snailrake_tourney_progress(tc, 300, 120, 40, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform public.snailrake_tourney_start(tc, 'Bo');
  perform public.snailrake_tourney_progress(tc, 500, 120, 40, true);
  select jsonb_agg(jsonb_build_object('u', user_id, 'k', kind, 'p', params)) into q from public.snailrake_push_queue;
  if jsonb_array_length(q) <> 1 or (q->0->>'u')::uuid <> a or q->0->>'k' <> 'beaten'
     or q->0->'p'->>'name' <> 'Bo' or (q->0->'p'->>'score')::int <> 500 then raise exception 'beaten: %', q; end if;
  log := log || 'beaten queued for the beaten only; ';

  -- 3: C starts; the host closes: no new starts, but not settled while C plays
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  perform public.snailrake_tourney_start(tc, 'Cilla');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  j := public.snailrake_tourney_close(tc);
  if j->>'status' <> 'closed' or (j->>'final')::boolean then raise exception 'close while C plays: %', j; end if;
  log := log || 'host close keeps it open for rounds in progress; ';

  -- 4: C finishes 100 (beats nobody) -> settled at once, everyone gets a result
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  j := public.snailrake_tourney_progress(tc, 100, 60, 20, true);
  if not (j->>'final')::boolean then raise exception 'not settled after the last round: %', j; end if;
  select jsonb_object_agg(user_id::text, params) into q from public.snailrake_push_queue where kind = 'result';
  if (q->a::text->>'rank')::int <> 2 or (q->b::text->>'rank')::int <> 1 or (q->c::text->>'rank')::int <> 3
     or q->a::text->>'winner' <> 'Bo' or (q->a::text->>'total')::int <> 3 then raise exception 'results: %', q; end if;
  if (select count(*) from public.snailrake_push_queue where kind = 'beaten') <> 1 then raise exception 'C beat somebody?'; end if;
  failed := false; begin perform public.snailrake_tourney_start(tc, 'X'); exception when others then failed := sqlerrm like '%closed%'; end;
  if not failed then raise exception 'start after close'; end if;
  log := log || 'settled when the last round ended, results for all; ';

  -- 5: rematch: C asks, A and B hear it; B pressing later lands in the same one
  j := public.snailrake_tourney_rematch(tc, 'Cilla');
  rc := j->>'code';
  if rc = tc or (j->>'duration')::int <> 120 or (j->>'hours')::int <> 24 or not (j->>'host')::boolean then raise exception 'rematch: %', j; end if;
  if (select count(*) from public.snailrake_push_queue where kind = 'rematch') <> 2
     or exists (select 1 from public.snailrake_push_queue where kind = 'rematch' and user_id = c) then raise exception 'rematch notices'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  if public.snailrake_tourney_rematch(tc, 'Bo')->>'code' <> rc then raise exception 'second rematch made a new one'; end if;
  if (select count(*) from public.snailrake_push_queue where kind = 'rematch') <> 2 then raise exception 'second rematch notified again'; end if;
  log := log || 'rematch once, others notified; ';

  -- 6: the deadline settles on its own (settle_due), and take_push drains with subscriptions
  update public.snailrake_tourneys set closes_at = now() - interval '1 minute' where code = rc;
  perform public.snailrake_settle_due();
  if (select status from public.snailrake_tourneys where code = rc) <> 'closed' then raise exception 'deadline did not settle'; end if;
  insert into public.snailrake_push_subscriptions (user_id, endpoint, p256dh, auth, lang) values (a, 'https://push.example/a', 'k', 's', 'en');
  q := public.snailrake_take_push(500);
  if not exists (select 1 from jsonb_array_elements(q) n where n->'subs'->0->>'endpoint' = 'https://push.example/a' and n->'subs'->0->>'lang' = 'en') then
    raise exception 'take_push lost the subscription: %', q;
  end if;
  if exists (select 1 from public.snailrake_push_queue) then raise exception 'queue not drained'; end if;
  log := log || 'deadline settles by itself, queue drained with subs';

  raise exception 'ALL OK (rolled back): %', log;
end $test$;
