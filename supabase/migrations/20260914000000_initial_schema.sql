create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_display_name_length check (
    display_name is null or char_length(display_name) between 1 and 120
  ),
  constraint profiles_timezone_length check (char_length(timezone) between 1 and 80)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  role_title text not null,
  status text not null default 'saved',
  applied_at timestamptz,
  source_url text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint applications_company_length check (char_length(company_name) between 1 and 120),
  constraint applications_role_length check (char_length(role_title) between 1 and 160),
  constraint applications_status_valid check (
    status in ('saved', 'applied', 'screening', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn')
  )
);

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  company_name text not null,
  role_title text,
  stage text not null default 'other',
  starts_at timestamptz not null,
  timezone text not null,
  mode text not null default 'unknown',
  location text,
  meeting_url text,
  notes text,
  calendar_event_id text,
  calendar_sync_status text not null default 'not_requested',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint interviews_company_length check (char_length(company_name) between 1 and 120),
  constraint interviews_stage_valid check (
    stage in ('recruiter', 'technical', 'manager', 'onsite', 'other')
  ),
  constraint interviews_mode_valid check (mode in ('virtual', 'phone', 'onsite', 'unknown')),
  constraint interviews_calendar_sync_valid check (
    calendar_sync_status in ('not_requested', 'pending', 'synced', 'failed')
  )
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  title text not null,
  notes text,
  due_at timestamptz,
  priority text not null default 'medium',
  status text not null default 'open',
  source text not null default 'manual',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tasks_title_length check (char_length(title) between 1 and 180),
  constraint tasks_priority_valid check (priority in ('low', 'medium', 'high')),
  constraint tasks_status_valid check (status in ('open', 'completed', 'cancelled')),
  constraint tasks_source_valid check (source in ('manual', 'assistant'))
);

create table public.proposal_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_request_id uuid not null,
  source_message text not null,
  provider text not null,
  model text not null,
  schema_version text not null default '1',
  status text not null default 'awaiting_confirmation',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint proposal_batches_status_valid check (
    status in ('awaiting_clarification', 'awaiting_confirmation', 'executing', 'executed', 'partially_failed', 'failed', 'cancelled', 'expired')
  ),
  constraint proposal_batches_request_unique unique (user_id, client_request_id)
);

create table public.action_proposals (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.proposal_batches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_ref text not null,
  kind text not null,
  version integer not null default 1,
  payload jsonb not null,
  evidence jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  idempotency_key text not null,
  executed_entity_type text,
  executed_entity_id uuid,
  error_code text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint action_proposals_kind_valid check (
    kind in ('create_application', 'create_interview', 'create_task')
  ),
  constraint action_proposals_status_valid check (
    status in ('pending', 'executing', 'executed', 'rejected', 'failed', 'expired')
  ),
  constraint action_proposals_version_positive check (version > 0),
  constraint action_proposals_ref_unique unique (batch_id, action_ref),
  constraint action_proposals_idempotency_unique unique (user_id, idempotency_key)
);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index applications_user_updated_idx on public.applications(user_id, updated_at desc);
create index interviews_user_starts_idx on public.interviews(user_id, starts_at);
create index tasks_user_status_due_idx on public.tasks(user_id, status, due_at);
create index proposal_batches_user_created_idx on public.proposal_batches(user_id, created_at desc);
create index action_proposals_user_status_idx on public.action_proposals(user_id, status);
create index activity_events_user_created_idx on public.activity_events(user_id, created_at desc);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger applications_set_updated_at
before update on public.applications
for each row execute function public.set_updated_at();

create trigger interviews_set_updated_at
before update on public.interviews
for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create trigger proposal_batches_set_updated_at
before update on public.proposal_batches
for each row execute function public.set_updated_at();

create trigger action_proposals_set_updated_at
before update on public.action_proposals
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.applications enable row level security;
alter table public.interviews enable row level security;
alter table public.tasks enable row level security;
alter table public.proposal_batches enable row level security;
alter table public.action_proposals enable row level security;
alter table public.activity_events enable row level security;

create policy "profiles_select_own"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "applications_manage_own"
on public.applications for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "interviews_manage_own"
on public.interviews for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "tasks_manage_own"
on public.tasks for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "proposal_batches_manage_own"
on public.proposal_batches for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "action_proposals_manage_own"
on public.action_proposals for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "activity_events_select_own"
on public.activity_events for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "activity_events_insert_own"
on public.activity_events for insert
to authenticated
with check ((select auth.uid()) = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
