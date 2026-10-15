-- Per-user daily cap on hosted AI requests, and removal of the pre-Job-Drive
-- application RPCs that no application code calls anymore.

create table public.ai_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, usage_date),
  constraint ai_usage_daily_count_valid check (request_count >= 0)
);

alter table public.ai_usage_daily enable row level security;

create policy "ai_usage_daily_select_own"
on public.ai_usage_daily for select
to authenticated
using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.ai_usage_daily from anon, authenticated;

-- Atomically reserves one hosted AI request for the caller's current UTC day.
-- Calling this directly only spends the caller's own allowance; the server
-- decides the limit and gates the provider call on the result.
create or replace function public.consume_ai_request(p_daily_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (timezone('utc', now()))::date;
  v_count integer;
begin
  if v_user_id is null then return jsonb_build_object('outcome', 'auth_required'); end if;
  if p_daily_limit is null or p_daily_limit not between 1 and 1000 then
    return jsonb_build_object('outcome', 'invalid_limit');
  end if;

  insert into public.ai_usage_daily as usage (user_id, usage_date, request_count)
  values (v_user_id, v_today, 1)
  on conflict (user_id, usage_date) do update
    set request_count = usage.request_count + 1,
        updated_at = timezone('utc', now())
    where usage.request_count < p_daily_limit
  returning usage.request_count into v_count;

  if v_count is null then
    return jsonb_build_object('outcome', 'limit_reached', 'limit', p_daily_limit);
  end if;

  return jsonb_build_object('outcome', 'allowed', 'used', v_count, 'limit', p_daily_limit);
end;
$$;

revoke all on function public.consume_ai_request(integer) from public, anon;
grant execute on function public.consume_ai_request(integer) to authenticated;

drop function if exists public.persist_application_proposal(uuid, text, text, text, text, text, jsonb, jsonb, jsonb);
drop function if exists public.confirm_create_application(uuid, integer, jsonb);
drop function if exists public.reject_application_proposal(uuid, integer);
