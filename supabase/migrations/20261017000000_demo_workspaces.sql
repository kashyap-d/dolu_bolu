-- Demo workspaces (docs/decisions/0021): visitors try dolu bolu through
-- Supabase anonymous sign-in. Each gets a private, seeded workspace that is
-- deleted after 7 days. Hosted AI use by demo users is capped per user and
-- across all demo users, because anyone can create a demo user.

create or replace function public.is_anonymous_user(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select u.is_anonymous from auth.users as u where u.id = p_user_id), false);
$$;
revoke all on function public.is_anonymous_user(uuid) from public, anon, authenticated;

-- One row per UTC day: hosted AI requests made by all demo users together.
create table public.ai_usage_demo_daily (
  usage_date date primary key,
  request_count integer not null default 0,
  constraint ai_usage_demo_daily_count_valid check (request_count >= 0)
);
alter table public.ai_usage_demo_daily enable row level security;
revoke all on public.ai_usage_demo_daily from anon, authenticated;

drop function public.consume_ai_request(integer);

-- Reserves one hosted AI request. Regular users get p_daily_limit per UTC
-- day; demo users get the smaller p_demo_daily_limit, and all demo users
-- together get p_demo_global_limit. Both counters change together or not at all.
create or replace function public.consume_ai_request(
  p_daily_limit integer,
  p_demo_daily_limit integer default 10,
  p_demo_global_limit integer default 300
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (timezone('utc', now()))::date;
  v_is_demo boolean;
  v_limit integer;
  v_count integer;
  v_global integer;
begin
  if v_user_id is null then return jsonb_build_object('outcome', 'auth_required'); end if;
  if p_daily_limit is null or p_daily_limit not between 1 and 1000
    or p_demo_daily_limit is null or p_demo_daily_limit not between 1 and 1000
    or p_demo_global_limit is null or p_demo_global_limit not between 1 and 100000
  then
    return jsonb_build_object('outcome', 'invalid_limit');
  end if;

  v_is_demo := public.is_anonymous_user(v_user_id);
  v_limit := case when v_is_demo then least(p_daily_limit, p_demo_daily_limit) else p_daily_limit end;

  insert into public.ai_usage_daily as usage (user_id, usage_date, request_count)
  values (v_user_id, v_today, 1)
  on conflict (user_id, usage_date) do update
    set request_count = usage.request_count + 1,
        updated_at = now()
    where usage.request_count < v_limit
  returning usage.request_count into v_count;

  if v_count is null then
    return jsonb_build_object('outcome', 'limit_reached', 'limit', v_limit);
  end if;

  if v_is_demo then
    insert into public.ai_usage_demo_daily as demo (usage_date, request_count)
    values (v_today, 1)
    on conflict (usage_date) do update
      set request_count = demo.request_count + 1
      where demo.request_count < p_demo_global_limit
    returning demo.request_count into v_global;

    if v_global is null then
      -- Give back the personal request reserved above.
      update public.ai_usage_daily set request_count = request_count - 1
      where user_id = v_user_id and usage_date = v_today;
      return jsonb_build_object('outcome', 'demo_capacity_reached');
    end if;
  end if;

  return jsonb_build_object('outcome', 'allowed', 'used', v_count, 'limit', v_limit);
end;
$$;
revoke all on function public.consume_ai_request(integer, integer, integer) from public, anon;
grant execute on function public.consume_ai_request(integer, integer, integer) to authenticated;

-- Fills a new demo user's empty workspace with realistic drives, dated
-- relative to now so the agenda has something in every section.
create or replace function public.seed_demo_workspace()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_zone constant text := 'Asia/Kolkata';
  v_today date;
  v_drive uuid;
  v_round record;
begin
  if v_user_id is null then return jsonb_build_object('outcome', 'auth_required'); end if;
  if not public.is_anonymous_user(v_user_id) then return jsonb_build_object('outcome', 'not_demo'); end if;
  if exists (select 1 from public.job_drives where user_id = v_user_id) then
    return jsonb_build_object('outcome', 'already_seeded');
  end if;

  v_today := (now() at time zone v_zone)::date;
  update public.profiles set timezone = v_zone where id = v_user_id;

  -- Interviewing: one round done, the next one tomorrow morning.
  insert into public.job_drives (user_id, company_name, role_title, stage, applied_at, location, notes)
  values (v_user_id, 'Razorpay', 'Software Engineer', 'interview', v_today - 12, 'Bengaluru',
    'Referred by a senior from college.')
  returning id into v_drive;
  insert into public.interviews (user_id, job_drive_id, company_name, role_title, title, kind, status, starts_at, timezone, mode, notes)
  values
    (v_user_id, v_drive, 'Razorpay', 'Software Engineer', 'Technical 1', 'technical', 'completed',
      ((v_today - 4) + time '15:00') at time zone v_zone, v_zone, 'virtual', 'DSA: arrays and a graph problem.'),
    (v_user_id, v_drive, 'Razorpay', 'Software Engineer', 'Technical 2', 'technical', 'scheduled',
      ((v_today + 1) + time '11:00') at time zone v_zone, v_zone, 'virtual', 'System design: a payments ledger.');

  -- An OA to finish this week.
  insert into public.job_drives (user_id, company_name, role_title, stage, applied_at, location)
  values (v_user_id, 'Swiggy', 'SDE 2', 'assessment', v_today - 6, 'Bengaluru')
  returning id into v_drive;
  insert into public.job_drive_assessments (job_drive_id, user_id, status, available_from, due_at, duration_minutes, assessment_url)
  values (v_drive, v_user_id, 'invited', (v_today + time '10:00') at time zone v_zone,
    ((v_today + 3) + time '23:59') at time zone v_zone, 90, 'https://example.com/assessment');

  -- A round that has passed but was never updated: a loose end.
  insert into public.job_drives (user_id, company_name, role_title, stage, applied_at, location)
  values (v_user_id, 'Atlassian', 'Frontend Engineer', 'interview', v_today - 20, 'Remote')
  returning id into v_drive;
  insert into public.interviews (user_id, job_drive_id, company_name, role_title, title, kind, status, starts_at, timezone, mode)
  values (v_user_id, v_drive, 'Atlassian', 'Frontend Engineer', 'Hiring manager', 'manager', 'scheduled',
    ((v_today - 1) + time '16:30') at time zone v_zone, v_zone, 'virtual');

  -- Planned, with an apply-by date.
  insert into public.job_drives (user_id, company_name, role_title, stage, apply_by, location, source_url)
  values (v_user_id, 'Zoho', 'Product Analyst', 'planned', v_today + 5, 'Chennai', 'https://example.com/jobs/product-analyst');

  -- Applied a month ago and heard nothing: gone quiet.
  insert into public.job_drives (user_id, company_name, role_title, stage, applied_at, created_at, updated_at)
  values (v_user_id, 'Meesho', 'Data Analyst', 'applied', v_today - 30, now() - interval '30 days', now() - interval '26 days');

  -- Closed.
  insert into public.job_drives (user_id, company_name, role_title, stage, applied_at)
  values (v_user_id, 'Flipkart', 'Backend Engineer', 'rejected', v_today - 40);

  insert into public.activity_events (user_id, event_type, entity_type, entity_id, metadata, created_at)
  select d.user_id, 'job_drive_created', 'job_drive', d.id,
    jsonb_build_object('source', 'demo', 'previousStage', null, 'newStage', d.stage,
      'changedFields', '["companyName","roleTitle","stage"]'::jsonb, 'occurredAt', null),
    d.created_at
  from public.job_drives as d where d.user_id = v_user_id;

  return jsonb_build_object('outcome', 'seeded');
end;
$$;
revoke all on function public.seed_demo_workspace() from public, anon;
grant execute on function public.seed_demo_workspace() to authenticated;

-- Deletes demo users (and, by cascade, everything they own) after 7 days.
-- Not callable through the API; run by pg_cron.
create or replace function public.delete_expired_demo_accounts()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_deleted integer;
begin
  delete from auth.users where is_anonymous and created_at < now() - interval '7 days';
  get diagnostics v_deleted = row_count;
  delete from public.ai_usage_demo_daily where usage_date < (timezone('utc', now()))::date - 30;
  return v_deleted;
end;
$$;
revoke all on function public.delete_expired_demo_accounts() from public, anon, authenticated;

-- Schedule the cleanup when pg_cron is enabled (Supabase: Integrations → Cron).
-- If it is not, enable it and run the cron.schedule call in docs/deployment.md.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('delete-expired-demo-accounts', '17 3 * * *', 'select public.delete_expired_demo_accounts()');
  end if;
end $$;
