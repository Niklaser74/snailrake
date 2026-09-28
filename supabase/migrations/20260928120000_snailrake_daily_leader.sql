-- Today's leader on the hub's card. The hub never creates an account, so this
-- one function is open to anon: it gives out only what the daily board already
-- shows everyone — the leader's display name and score, and how many played.
-- No user ids, no seed.
create or replace function public.snailrake_daily_leader()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'day', public.snailrake_today(),
    'players', (select count(*) from public.snailrake_daily where day = public.snailrake_today()),
    'leader', (select jsonb_build_object('name', name, 'score', score)
                 from public.snailrake_daily
                where day = public.snailrake_today() and score > 0
                order by score desc, updated_at limit 1));
$$;
revoke execute on function public.snailrake_daily_leader() from public;
grant execute on function public.snailrake_daily_leader() to anon, authenticated;
