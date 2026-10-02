-- Tournaments on the hub's card.
--
-- snailrake_tourney_stats() is open to anon like the leader and the week's
-- top: only counts — how many tournaments are running, how many rounds were
-- played this week. No codes (a tournament is a private link), no names.
--
-- snailrake_tourney_mine() also gets the caller's place, so the hub (for a
-- browser that already has an account) and the game can say "you lead".
create or replace function public.snailrake_tourney_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open', (select count(*) from public.snailrake_tourneys t
              where public.snailrake_tourney_open(t)
                and exists (select 1 from public.snailrake_entries e where e.tourney_id = t.id)),
    'rounds_week', (select count(*) from public.snailrake_entries
                     where started_at >= public.snailrake_week()::timestamp at time zone 'utc'));
$$;
revoke execute on function public.snailrake_tourney_stats() from public;
grant execute on function public.snailrake_tourney_stats() to anon, authenticated;

create or replace function public.snailrake_tourney_mine()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', t.code, 'duration', t.duration_s,
           'status', case when public.snailrake_tourney_open(t) then 'open' else 'closed' end,
           'final', t.status = 'closed', 'closes_at', t.closes_at, 'created_at', t.created_at,
           'host', t.host = auth.uid(), 'now', now(),
           'players', (select count(*) from public.snailrake_entries e where e.tourney_id = t.id),
           'winner', (select e.name from public.snailrake_entries e where e.tourney_id = t.id
                       order by e.score desc, e.updated_at limit 1),
           'me_rank', (select r.rank from (select e.user_id, row_number() over (order by e.score desc, e.updated_at) as rank
                                             from public.snailrake_entries e where e.tourney_id = t.id) r
                        where r.user_id = auth.uid()))
         order by t.created_at desc), '[]')
  from (select * from public.snailrake_tourneys t
         where t.host = auth.uid()
            or exists (select 1 from public.snailrake_entries e where e.tourney_id = t.id and e.user_id = auth.uid())
         order by t.created_at desc limit 10) t;
$$;
