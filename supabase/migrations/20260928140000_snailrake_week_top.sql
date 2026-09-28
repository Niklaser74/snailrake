-- The week's top three on the hub's card. Open to anon like
-- snailrake_daily_leader, and for the same reason: the hub never creates an
-- account. Only what the weekly board shows everyone — display names and
-- scores of the top three, and how many are on the board. No user ids.
create or replace function public.snailrake_week_top()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'week', public.snailrake_week(),
    'players', (select count(*) from public.snailrake_weekly where week = public.snailrake_week()),
    'top', coalesce((select jsonb_agg(jsonb_build_object('name', r.name, 'score', r.score) order by r.score desc, r.updated_at)
                       from (select name, score, updated_at from public.snailrake_weekly
                              where week = public.snailrake_week() and score > 0
                              order by score desc, updated_at limit 3) r), '[]'));
$$;
revoke execute on function public.snailrake_week_top() from public;
grant execute on function public.snailrake_week_top() to anon, authenticated;
