-- Refocus the application tracker around one owner-scoped Job Drive lifecycle.

alter table public.applications rename to job_drives;
alter table public.job_drives rename column status to stage;
alter table public.job_drives drop constraint applications_status_valid;

alter table public.job_drives disable trigger applications_set_updated_at;
update public.job_drives
set stage = case stage
  when 'saved' then 'planned'
  when 'screening' then 'applied'
  when 'interviewing' then 'interview'
  else stage
end;
alter table public.job_drives enable trigger applications_set_updated_at;

alter table public.job_drives
add column location text,
add column apply_by timestamptz,
add column stage_occurred_at timestamptz,
add constraint job_drives_stage_valid check (
  stage in ('planned', 'applied', 'assessment', 'interview', 'offer', 'accepted', 'rejected', 'withdrawn')
),
add constraint job_drives_location_length check (
  location is null or char_length(location) between 1 and 240
);

alter table public.job_drives rename constraint applications_id_user_unique to job_drives_id_user_unique;
alter table public.job_drives rename constraint applications_company_length to job_drives_company_length;
alter table public.job_drives rename constraint applications_role_length to job_drives_role_length;
alter table public.job_drives rename constraint applications_company_trimmed to job_drives_company_trimmed;
alter table public.job_drives rename constraint applications_role_trimmed to job_drives_role_trimmed;
alter index public.applications_user_updated_idx rename to job_drives_user_updated_idx;
alter trigger applications_set_updated_at on public.job_drives rename to job_drives_set_updated_at;
alter policy "applications_manage_own" on public.job_drives rename to "job_drives_manage_own";

alter table public.interviews rename column application_id to job_drive_id;
alter table public.interviews alter column starts_at drop not null;
alter table public.interviews alter column timezone drop not null;
alter table public.interviews add column round_summary text;
alter table public.interviews add constraint interviews_round_summary_length check (
  round_summary is null or char_length(round_summary) between 1 and 1000
);
alter table public.interviews rename constraint interviews_application_owner_fkey to interviews_job_drive_owner_fkey;

alter table public.tasks rename column application_id to job_drive_id;
alter table public.tasks rename constraint tasks_application_owner_fkey to tasks_job_drive_owner_fkey;

create table public.job_drive_assessments (
  job_drive_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'invited',
  available_from timestamptz,
  due_at timestamptz,
  duration_minutes integer,
  assessment_url text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint job_drive_assessments_owner_fkey
    foreign key (job_drive_id, user_id)
    references public.job_drives (id, user_id) on delete cascade,
  constraint job_drive_assessments_status_valid check (
    status in ('invited', 'scheduled', 'completed', 'passed', 'failed', 'cancelled')
  ),
  constraint job_drive_assessments_window_valid check (
    due_at is null or available_from is null or due_at >= available_from
  ),
  constraint job_drive_assessments_duration_valid check (
    duration_minutes is null or duration_minutes between 1 and 1440
  ),
  constraint job_drive_assessments_url_length check (
    assessment_url is null or char_length(assessment_url) between 1 and 2048
  ),
  constraint job_drive_assessments_notes_length check (
    notes is null or char_length(notes) between 1 and 2000
  )
);

create index job_drive_assessments_user_due_idx on public.job_drive_assessments(user_id, due_at);
create trigger job_drive_assessments_set_updated_at
before update on public.job_drive_assessments
for each row execute function public.set_updated_at();
alter table public.job_drive_assessments enable row level security;
create policy "job_drive_assessments_select_own"
on public.job_drive_assessments for select to authenticated
using ((select auth.uid()) = user_id);

drop policy "job_drives_manage_own" on public.job_drives;
create policy "job_drives_select_own"
on public.job_drives for select to authenticated
using ((select auth.uid()) = user_id);
drop policy "interviews_manage_own" on public.interviews;
create policy "interviews_select_own"
on public.interviews for select to authenticated
using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.job_drives from anon, authenticated;
revoke insert, update, delete on public.job_drive_assessments from anon, authenticated;
revoke insert, update, delete on public.interviews from anon, authenticated;

update public.activity_events set entity_type = 'job_drive' where entity_type = 'application';
update public.action_proposals set executed_entity_type = 'job_drive' where executed_entity_type = 'application';
update public.action_proposals
set status = 'expired', error_code = 'DOMAIN_MIGRATED', version = version + 1
where kind = 'create_application' and status = 'pending';
update public.proposal_batches as batches
set status = 'cancelled'
where batches.status = 'awaiting_confirmation'
  and not exists (
    select 1 from public.action_proposals as pending
    where pending.batch_id = batches.id and pending.status = 'pending'
  );

alter table public.action_proposals drop constraint action_proposals_kind_valid;
alter table public.action_proposals add constraint action_proposals_kind_valid check (
  kind in ('create_application', 'create_interview', 'create_task', 'record_job_drive_progress')
);

create or replace function public.job_drive_stage_rank(p_stage text)
returns integer language sql immutable security invoker set search_path = '' as $$
  select case p_stage
    when 'planned' then 0 when 'applied' then 1 when 'assessment' then 2
    when 'interview' then 3 when 'offer' then 4 when 'accepted' then 5
    else null
  end;
$$;

create or replace function public.job_drive_json(p_job_drive_id uuid, p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', drives.id, 'companyName', drives.company_name,
    'roleTitle', drives.role_title, 'stage', drives.stage,
    'stageOccurredAt', drives.stage_occurred_at,
    'appliedAt', drives.applied_at, 'applyBy', drives.apply_by,
    'location', drives.location, 'sourceUrl', drives.source_url,
    'notes', drives.notes,
    'assessment', (
      select jsonb_build_object(
        'status', a.status, 'availableFrom', a.available_from,
        'dueAt', a.due_at, 'durationMinutes', a.duration_minutes,
        'assessmentUrl', a.assessment_url, 'notes', a.notes, 'updatedAt', a.updated_at
      ) from public.job_drive_assessments as a
      where a.job_drive_id = drives.id and a.user_id = p_user_id
    ),
    'interview', (
      select jsonb_build_object(
        'nextScheduledAt', i.starts_at, 'timeZone', nullif(i.timezone, ''),
        'mode', i.mode, 'location', i.location, 'meetingUrl', i.meeting_url,
        'roundSummary', i.round_summary, 'notes', i.notes, 'updatedAt', i.updated_at
      ) from public.interviews as i
      where i.job_drive_id = drives.id and i.user_id = p_user_id
      order by i.updated_at desc limit 1
    ),
    'createdAt', drives.created_at, 'updatedAt', drives.updated_at
  )
  from public.job_drives as drives
  where drives.id = p_job_drive_id and drives.user_id = p_user_id;
$$;

create or replace function public.apply_job_drive_change(
  p_job_drive_id uuid,
  p_expected_updated_at timestamptz,
  p_payload jsonb,
  p_source text,
  p_allow_possible_duplicate boolean default false,
  p_is_correction boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.job_drives%rowtype;
  v_after public.job_drives%rowtype;
  v_company text;
  v_role text;
  v_stage text;
  v_location text;
  v_source_url text;
  v_notes text;
  v_applied_at timestamptz;
  v_apply_by timestamptz;
  v_occurred_at timestamptz;
  v_assessment jsonb;
  v_interview jsonb;
  v_assessment_from timestamptz;
  v_assessment_due timestamptz;
  v_interview_at timestamptz;
  v_changed jsonb := '[]'::jsonb;
  v_duplicates jsonb;
  v_interview_id uuid;
  v_outcome text;
begin
  if v_user_id is null then return jsonb_build_object('outcome', 'auth_required'); end if;
  if p_job_drive_id is null or p_payload is null
    or p_source not in ('manual', 'assistant')
    or jsonb_typeof(p_payload) <> 'object'
    or not p_payload ?& array[
      'companyName', 'roleTitle', 'stage', 'stageOccurredAt', 'appliedAt',
      'applyBy', 'location', 'sourceUrl', 'notes', 'assessment', 'interview'
    ]
    or exists (
      select 1 from jsonb_object_keys(p_payload) as keys(key)
      where keys.key not in (
        'companyName', 'roleTitle', 'stage', 'stageOccurredAt', 'appliedAt',
        'applyBy', 'location', 'sourceUrl', 'notes', 'assessment', 'interview'
      )
    )
    or jsonb_typeof(p_payload -> 'companyName') <> 'string'
    or jsonb_typeof(p_payload -> 'roleTitle') <> 'string'
    or jsonb_typeof(p_payload -> 'stage') <> 'string'
    or jsonb_typeof(p_payload -> 'stageOccurredAt') not in ('string', 'null')
    or jsonb_typeof(p_payload -> 'appliedAt') not in ('string', 'null')
    or jsonb_typeof(p_payload -> 'applyBy') not in ('string', 'null')
    or jsonb_typeof(p_payload -> 'location') not in ('string', 'null')
    or jsonb_typeof(p_payload -> 'sourceUrl') not in ('string', 'null')
    or jsonb_typeof(p_payload -> 'notes') not in ('string', 'null')
    or jsonb_typeof(p_payload -> 'assessment') not in ('object', 'null')
    or jsonb_typeof(p_payload -> 'interview') not in ('object', 'null')
  then return jsonb_build_object('outcome', 'invalid_payload'); end if;

  v_company := btrim(p_payload ->> 'companyName');
  v_role := btrim(p_payload ->> 'roleTitle');
  v_stage := p_payload ->> 'stage';
  v_location := nullif(btrim(p_payload ->> 'location'), '');
  v_source_url := nullif(btrim(p_payload ->> 'sourceUrl'), '');
  v_notes := nullif(btrim(p_payload ->> 'notes'), '');
  v_assessment := p_payload -> 'assessment';
  v_interview := p_payload -> 'interview';

  if nullif(v_company, '') is null or char_length(v_company) > 120
    or nullif(v_role, '') is null or char_length(v_role) > 160
    or v_stage not in ('planned', 'applied', 'assessment', 'interview', 'offer', 'accepted', 'rejected', 'withdrawn')
    or char_length(coalesce(v_location, '')) > 240
    or char_length(coalesce(v_source_url, '')) > 2048
    or (v_source_url is not null and v_source_url !~* '^https?://[^[:space:]]+$')
    or char_length(coalesce(v_notes, '')) > 2000
    or jsonb_typeof(v_assessment) not in ('object', 'null')
    or jsonb_typeof(v_interview) not in ('object', 'null')
  then return jsonb_build_object('outcome', 'invalid_payload'); end if;

  begin
    if p_payload ->> 'stageOccurredAt' is not null then v_occurred_at := (p_payload ->> 'stageOccurredAt')::timestamptz; end if;
    if p_payload ->> 'appliedAt' is not null then v_applied_at := (p_payload ->> 'appliedAt')::timestamptz; end if;
    if p_payload ->> 'applyBy' is not null then v_apply_by := (p_payload ->> 'applyBy')::timestamptz; end if;
  exception when others then return jsonb_build_object('outcome', 'invalid_payload'); end;

  if jsonb_typeof(v_assessment) = 'object' then
    if not v_assessment ?& array['status', 'availableFrom', 'dueAt', 'durationMinutes', 'assessmentUrl', 'notes']
      or exists (
        select 1 from jsonb_object_keys(v_assessment) as keys(key)
        where keys.key not in ('status', 'availableFrom', 'dueAt', 'durationMinutes', 'assessmentUrl', 'notes')
      )
      or jsonb_typeof(v_assessment -> 'status') <> 'string'
      or jsonb_typeof(v_assessment -> 'availableFrom') not in ('string', 'null')
      or jsonb_typeof(v_assessment -> 'dueAt') not in ('string', 'null')
      or jsonb_typeof(v_assessment -> 'durationMinutes') not in ('number', 'null')
      or jsonb_typeof(v_assessment -> 'assessmentUrl') not in ('string', 'null')
      or jsonb_typeof(v_assessment -> 'notes') not in ('string', 'null')
      or v_assessment ->> 'status' not in ('invited', 'scheduled', 'completed', 'passed', 'failed', 'cancelled')
      or (v_assessment ->> 'durationMinutes' is not null and (
        v_assessment ->> 'durationMinutes' !~ '^[0-9]+$'
        or (v_assessment ->> 'durationMinutes')::numeric not between 1 and 1440
      ))
      or char_length(coalesce(nullif(btrim(v_assessment ->> 'assessmentUrl'), ''), '')) > 2048
      or (nullif(btrim(v_assessment ->> 'assessmentUrl'), '') is not null and nullif(btrim(v_assessment ->> 'assessmentUrl'), '') !~* '^https?://[^[:space:]]+$')
      or char_length(coalesce(nullif(btrim(v_assessment ->> 'notes'), ''), '')) > 2000
    then return jsonb_build_object('outcome', 'invalid_payload'); end if;
    begin
      if v_assessment ->> 'availableFrom' is not null then v_assessment_from := (v_assessment ->> 'availableFrom')::timestamptz; end if;
      if v_assessment ->> 'dueAt' is not null then v_assessment_due := (v_assessment ->> 'dueAt')::timestamptz; end if;
    exception when others then return jsonb_build_object('outcome', 'invalid_payload'); end;
    if v_assessment_due is not null and v_assessment_from is not null and v_assessment_due < v_assessment_from
    then return jsonb_build_object('outcome', 'invalid_payload'); end if;
  end if;

  if jsonb_typeof(v_interview) = 'object' then
    if not v_interview ?& array['nextScheduledAt', 'timeZone', 'mode', 'location', 'meetingUrl', 'roundSummary', 'notes']
      or exists (
        select 1 from jsonb_object_keys(v_interview) as keys(key)
        where keys.key not in ('nextScheduledAt', 'timeZone', 'mode', 'location', 'meetingUrl', 'roundSummary', 'notes')
      )
      or jsonb_typeof(v_interview -> 'nextScheduledAt') not in ('string', 'null')
      or jsonb_typeof(v_interview -> 'timeZone') not in ('string', 'null')
      or jsonb_typeof(v_interview -> 'mode') <> 'string'
      or jsonb_typeof(v_interview -> 'location') not in ('string', 'null')
      or jsonb_typeof(v_interview -> 'meetingUrl') not in ('string', 'null')
      or jsonb_typeof(v_interview -> 'roundSummary') not in ('string', 'null')
      or jsonb_typeof(v_interview -> 'notes') not in ('string', 'null')
      or v_interview ->> 'mode' not in ('virtual', 'phone', 'onsite', 'unknown')
      or char_length(coalesce(nullif(btrim(v_interview ->> 'timeZone'), ''), '')) > 80
      or (nullif(btrim(v_interview ->> 'timeZone'), '') is not null and not exists (
        select 1 from pg_catalog.pg_timezone_names as zones
        where zones.name = btrim(v_interview ->> 'timeZone')
      ))
      or char_length(coalesce(nullif(btrim(v_interview ->> 'location'), ''), '')) > 240
      or char_length(coalesce(nullif(btrim(v_interview ->> 'roundSummary'), ''), '')) > 1000
      or char_length(coalesce(nullif(btrim(v_interview ->> 'notes'), ''), '')) > 2000
      or char_length(coalesce(nullif(btrim(v_interview ->> 'meetingUrl'), ''), '')) > 2048
      or (nullif(btrim(v_interview ->> 'meetingUrl'), '') is not null and nullif(btrim(v_interview ->> 'meetingUrl'), '') !~* '^https?://[^[:space:]]+$')
    then return jsonb_build_object('outcome', 'invalid_payload'); end if;
    begin
      if v_interview ->> 'nextScheduledAt' is not null then v_interview_at := (v_interview ->> 'nextScheduledAt')::timestamptz; end if;
    exception when others then return jsonb_build_object('outcome', 'invalid_payload'); end;
    if v_interview_at is not null and nullif(btrim(v_interview ->> 'timeZone'), '') is null
    then return jsonb_build_object('outcome', 'invalid_payload'); end if;
  end if;

  select * into v_existing from public.job_drives as d
  where d.id = p_job_drive_id and d.user_id = v_user_id for update;

  if found and p_expected_updated_at is null then
    if v_existing.company_name = v_company and v_existing.role_title = v_role and v_existing.stage = v_stage then
      return jsonb_build_object('outcome', 'already_created', 'jobDrive', public.job_drive_json(v_existing.id, v_user_id));
    end if;
    return jsonb_build_object('outcome', 'conflict');
  end if;

  if not found then
    if p_expected_updated_at is not null then return jsonb_build_object('outcome', 'not_found'); end if;
    select coalesce(jsonb_agg(candidate), '[]'::jsonb) into v_duplicates
    from (
      select jsonb_build_object(
        'id', d.id, 'companyName', d.company_name, 'roleTitle', d.role_title,
        'stage', d.stage, 'location', d.location, 'sourceUrl', d.source_url,
        'updatedAt', d.updated_at
      ) as candidate
      from public.job_drives as d
      where d.user_id = v_user_id and d.stage not in ('accepted', 'rejected', 'withdrawn')
        and ((v_source_url is not null and lower(coalesce(d.source_url, '')) = lower(v_source_url))
          or (lower(d.company_name) = lower(v_company) and lower(d.role_title) = lower(v_role)
            and (v_location is null or d.location is null or lower(d.location) = lower(v_location))))
      order by d.updated_at desc limit 5
    ) as duplicate_rows;
    if jsonb_array_length(v_duplicates) > 0 and not p_allow_possible_duplicate then
      return jsonb_build_object('outcome', 'possible_duplicate', 'candidates', v_duplicates);
    end if;
    insert into public.job_drives (
      id, user_id, company_name, role_title, stage, stage_occurred_at,
      applied_at, apply_by, location, source_url, notes
    ) values (
      p_job_drive_id, v_user_id, v_company, v_role, v_stage, v_occurred_at,
      v_applied_at, v_apply_by, v_location, v_source_url, v_notes
    ) returning * into v_after;
    v_changed := '["companyName","roleTitle","stage"]'::jsonb;
    if v_occurred_at is not null then v_changed := v_changed || '"stageOccurredAt"'::jsonb; end if;
    if v_location is not null then v_changed := v_changed || '"location"'::jsonb; end if;
    if v_source_url is not null then v_changed := v_changed || '"sourceUrl"'::jsonb; end if;
    if v_applied_at is not null then v_changed := v_changed || '"appliedAt"'::jsonb; end if;
    if v_apply_by is not null then v_changed := v_changed || '"applyBy"'::jsonb; end if;
    if v_notes is not null then v_changed := v_changed || '"notes"'::jsonb; end if;
    v_outcome := 'created';
  else
    if p_expected_updated_at is null or v_existing.updated_at <> p_expected_updated_at
    then return jsonb_build_object('outcome', 'conflict'); end if;
    if ((v_existing.stage in ('accepted', 'rejected', 'withdrawn') and v_stage <> v_existing.stage)
      or (public.job_drive_stage_rank(v_existing.stage) is not null
        and public.job_drive_stage_rank(v_stage) is not null
        and public.job_drive_stage_rank(v_stage) < public.job_drive_stage_rank(v_existing.stage)))
      and not p_is_correction
    then return jsonb_build_object('outcome', 'correction_required'); end if;

    if v_existing.company_name is distinct from v_company then v_changed := v_changed || '"companyName"'::jsonb; end if;
    if v_existing.role_title is distinct from v_role then v_changed := v_changed || '"roleTitle"'::jsonb; end if;
    if v_existing.stage is distinct from v_stage then v_changed := v_changed || '"stage"'::jsonb; end if;
    if v_existing.stage_occurred_at is distinct from v_occurred_at then v_changed := v_changed || '"stageOccurredAt"'::jsonb; end if;
    if v_existing.applied_at is distinct from v_applied_at then v_changed := v_changed || '"appliedAt"'::jsonb; end if;
    if v_existing.apply_by is distinct from v_apply_by then v_changed := v_changed || '"applyBy"'::jsonb; end if;
    if v_existing.location is distinct from v_location then v_changed := v_changed || '"location"'::jsonb; end if;
    if v_existing.source_url is distinct from v_source_url then v_changed := v_changed || '"sourceUrl"'::jsonb; end if;
    if v_existing.notes is distinct from v_notes then v_changed := v_changed || '"notes"'::jsonb; end if;

    update public.job_drives set company_name = v_company, role_title = v_role,
      stage = v_stage, stage_occurred_at = v_occurred_at, applied_at = v_applied_at,
      apply_by = v_apply_by, location = v_location, source_url = v_source_url, notes = v_notes
    where id = v_existing.id and user_id = v_user_id returning * into v_after;
    v_outcome := 'updated';
  end if;

  if jsonb_typeof(v_assessment) = 'object' then
    insert into public.job_drive_assessments (
      job_drive_id, user_id, status, available_from, due_at,
      duration_minutes, assessment_url, notes
    ) values (
      v_after.id, v_user_id, v_assessment ->> 'status', v_assessment_from,
      v_assessment_due, nullif(v_assessment ->> 'durationMinutes', '')::integer,
      nullif(btrim(v_assessment ->> 'assessmentUrl'), ''), nullif(btrim(v_assessment ->> 'notes'), '')
    ) on conflict (job_drive_id) do update set status = excluded.status,
      available_from = excluded.available_from, due_at = excluded.due_at,
      duration_minutes = excluded.duration_minutes, assessment_url = excluded.assessment_url,
      notes = excluded.notes;
    v_changed := v_changed || '"assessment"'::jsonb;
  end if;

  if jsonb_typeof(v_interview) = 'object' then
    select i.id into v_interview_id from public.interviews as i
    where i.job_drive_id = v_after.id and i.user_id = v_user_id
    order by i.updated_at desc limit 1 for update;
    if v_interview_id is null then
      insert into public.interviews (
        user_id, job_drive_id, company_name, role_title, stage, starts_at,
        timezone, mode, location, meeting_url, round_summary, notes
      ) values (
        v_user_id, v_after.id, v_company, v_role, 'other', v_interview_at,
        nullif(btrim(v_interview ->> 'timeZone'), ''),
        v_interview ->> 'mode', nullif(btrim(v_interview ->> 'location'), ''),
        nullif(btrim(v_interview ->> 'meetingUrl'), ''),
        nullif(btrim(v_interview ->> 'roundSummary'), ''), nullif(btrim(v_interview ->> 'notes'), '')
      );
    else
      update public.interviews set company_name = v_company, role_title = v_role,
        starts_at = v_interview_at,
        timezone = nullif(btrim(v_interview ->> 'timeZone'), ''),
        mode = v_interview ->> 'mode', location = nullif(btrim(v_interview ->> 'location'), ''),
        meeting_url = nullif(btrim(v_interview ->> 'meetingUrl'), ''),
        round_summary = nullif(btrim(v_interview ->> 'roundSummary'), ''),
        notes = nullif(btrim(v_interview ->> 'notes'), '')
      where id = v_interview_id and user_id = v_user_id;
    end if;
    v_changed := v_changed || '"interview"'::jsonb;
  end if;

  insert into public.activity_events (user_id, event_type, entity_type, entity_id, metadata)
  values (
    v_user_id,
    case when v_outcome = 'created' then 'job_drive_created'
      when p_is_correction then 'job_drive_corrected' else 'job_drive_updated' end,
    'job_drive', v_after.id,
    jsonb_build_object(
      'source', p_source,
      'previousStage', case when v_outcome = 'created' then null else v_existing.stage end,
      'newStage', v_after.stage,
      'changedFields', v_changed,
      'occurredAt', v_occurred_at
    )
  );
  return jsonb_build_object('outcome', v_outcome, 'jobDrive', public.job_drive_json(v_after.id, v_user_id));
exception
  when check_violation or invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('outcome', 'invalid_payload');
end;
$$;

create or replace function public.save_job_drive(
  p_job_drive_id uuid,
  p_expected_updated_at timestamptz,
  p_payload jsonb,
  p_allow_possible_duplicate boolean default false,
  p_is_correction boolean default false
)
returns jsonb language sql security definer set search_path = '' as $$
  select public.apply_job_drive_change(
    p_job_drive_id, p_expected_updated_at, p_payload,
    'manual', p_allow_possible_duplicate, p_is_correction
  );
$$;

create or replace function public.persist_job_drive_proposal(
  p_client_request_id uuid,
  p_source_message text,
  p_provider text,
  p_model text,
  p_action_ref text,
  p_summary text,
  p_payload jsonb,
  p_evidence jsonb,
  p_assumptions jsonb
)
returns table (
  batch_id uuid,
  proposal_id uuid,
  proposal_version integer,
  action_ref text,
  proposal_summary text,
  proposal_payload jsonb,
  proposal_evidence jsonb,
  proposal_assumptions jsonb
)
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_batch_id uuid;
  v_existing_message text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if p_client_request_id is null
    or char_length(btrim(coalesce(p_source_message, ''))) not between 1 and 2000
    or char_length(btrim(coalesce(p_provider, ''))) not between 1 and 40
    or char_length(btrim(coalesce(p_model, ''))) not between 1 and 100
    or p_action_ref !~ '^draft:[1-5]$'
    or char_length(btrim(coalesce(p_summary, ''))) not between 1 and 180
    or jsonb_typeof(p_payload) <> 'object'
    or jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) > 8
    or jsonb_typeof(p_assumptions) <> 'array' or jsonb_array_length(p_assumptions) > 8
  then raise exception using errcode = '22023', message = 'INVALID_PROPOSAL'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_evidence) as evidence(item)
    where jsonb_typeof(evidence.item) <> 'object'
      or not evidence.item ?& array['fieldPath', 'quote']
      or strpos(btrim(p_source_message), evidence.item ->> 'quote') = 0
  ) then raise exception using errcode = '22023', message = 'INVALID_PROPOSAL'; end if;

  insert into public.proposal_batches (
    user_id, client_request_id, source_message, provider, model, status, schema_version
  ) values (
    v_user_id, p_client_request_id, btrim(p_source_message), btrim(p_provider),
    btrim(p_model), 'awaiting_confirmation', '2'
  ) on conflict (user_id, client_request_id) do nothing returning id into v_batch_id;

  if v_batch_id is null then
    select b.id, b.source_message into v_batch_id, v_existing_message
    from public.proposal_batches as b
    where b.user_id = v_user_id and b.client_request_id = p_client_request_id;
    if v_existing_message is distinct from btrim(p_source_message) then
      raise exception using errcode = '22023', message = 'REQUEST_ID_REUSED';
    end if;
    return query
    select p.batch_id, p.id, p.version, p.action_ref, p.summary,
      p.payload, p.evidence, p.assumptions
    from public.action_proposals as p
    where p.batch_id = v_batch_id and p.user_id = v_user_id
      and p.kind = 'record_job_drive_progress'
    order by p.created_at limit 1;
    return;
  end if;

  return query
  insert into public.action_proposals (
    batch_id, user_id, action_ref, kind, summary, payload,
    evidence, assumptions, status, idempotency_key
  ) values (
    v_batch_id, v_user_id, p_action_ref, 'record_job_drive_progress',
    btrim(p_summary), p_payload, p_evidence, p_assumptions, 'pending',
    v_user_id::text || ':' || p_client_request_id::text || ':' || p_action_ref
  )
  returning action_proposals.batch_id, action_proposals.id,
    action_proposals.version, action_proposals.action_ref,
    action_proposals.summary, action_proposals.payload,
    action_proposals.evidence, action_proposals.assumptions;
end;
$$;

create or replace function public.confirm_job_drive_progress(
  p_action_id uuid,
  p_expected_version integer,
  p_payload jsonb,
  p_allow_possible_duplicate boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_action record;
  v_job_drive_id uuid;
  v_expected_updated_at timestamptz;
  v_execution_payload jsonb;
  v_result jsonb;
begin
  if v_user_id is null then return jsonb_build_object('outcome', 'auth_required'); end if;
  select p.id, p.batch_id, p.version, p.status, p.kind, p.payload,
    p.executed_entity_type, p.executed_entity_id, b.status as batch_status
  into v_action
  from public.action_proposals as p
  join public.proposal_batches as b on b.id = p.batch_id and b.user_id = p.user_id
  where p.id = p_action_id and p.user_id = v_user_id
  for update of p, b;

  if not found or v_action.kind <> 'record_job_drive_progress' then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_action.status = 'executed' and v_action.executed_entity_type = 'job_drive'
    and v_action.executed_entity_id is not null
  then
    return jsonb_build_object(
      'outcome', 'already_executed', 'proposalId', v_action.id,
      'jobDrive', public.job_drive_json(v_action.executed_entity_id, v_user_id)
    );
  end if;
  if p_expected_version is null or p_expected_version < 1
    or v_action.version <> p_expected_version or v_action.status <> 'pending'
    or v_action.batch_status <> 'awaiting_confirmation'
  then return jsonb_build_object('outcome', 'conflict'); end if;
  if jsonb_typeof(p_payload) <> 'object'
    or jsonb_typeof(v_action.payload -> 'jobDriveId') not in ('string', 'null')
    or jsonb_typeof(v_action.payload -> 'expectedUpdatedAt') not in ('string', 'null')
    or jsonb_typeof(v_action.payload -> 'isCorrection') <> 'boolean'
  then return jsonb_build_object('outcome', 'invalid_payload'); end if;

  begin
    v_job_drive_id := coalesce(nullif(v_action.payload ->> 'jobDriveId', '')::uuid, gen_random_uuid());
    if v_action.payload ->> 'expectedUpdatedAt' is not null then
      v_expected_updated_at := (v_action.payload ->> 'expectedUpdatedAt')::timestamptz;
    end if;
  exception when others then return jsonb_build_object('outcome', 'invalid_payload'); end;

  v_result := public.apply_job_drive_change(
    v_job_drive_id, v_expected_updated_at,
    p_payload, 'assistant', p_allow_possible_duplicate,
    (v_action.payload ->> 'isCorrection')::boolean
  );
  if v_result ->> 'outcome' = 'possible_duplicate' then return v_result; end if;
  if v_result ->> 'outcome' in ('conflict', 'correction_required') then
    return jsonb_build_object('outcome', 'conflict');
  end if;
  if v_result ->> 'outcome' not in ('created', 'already_created', 'updated') then
    return jsonb_build_object('outcome', 'invalid_payload');
  end if;

  v_execution_payload := p_payload || jsonb_build_object(
    'jobDriveId', v_job_drive_id,
    'expectedUpdatedAt', v_expected_updated_at,
    'isCorrection', (v_action.payload ->> 'isCorrection')::boolean
  );
  update public.action_proposals set payload = v_execution_payload, status = 'executed',
    version = version + 1, executed_entity_type = 'job_drive',
    executed_entity_id = v_job_drive_id, error_code = null
  where id = v_action.id and user_id = v_user_id;
  update public.proposal_batches as b set status = 'executed'
  where b.id = v_action.batch_id and b.user_id = v_user_id
    and not exists (
      select 1 from public.action_proposals as pending
      where pending.batch_id = b.id and pending.user_id = v_user_id and pending.status = 'pending'
    );
  return jsonb_build_object(
    'outcome', 'executed', 'proposalId', v_action.id,
    'jobDrive', v_result -> 'jobDrive'
  );
exception when others then return jsonb_build_object('outcome', 'invalid_payload');
end;
$$;

create or replace function public.reject_job_drive_proposal(
  p_action_id uuid,
  p_expected_version integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_action record;
begin
  if v_user_id is null then return jsonb_build_object('outcome', 'auth_required'); end if;
  select p.id, p.batch_id, p.version, p.status, p.kind, b.status as batch_status
  into v_action
  from public.action_proposals as p
  join public.proposal_batches as b on b.id = p.batch_id and b.user_id = p.user_id
  where p.id = p_action_id and p.user_id = v_user_id
  for update of p, b;
  if not found or v_action.kind <> 'record_job_drive_progress' then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_action.status = 'rejected' then return jsonb_build_object('outcome', 'already_rejected'); end if;
  if p_expected_version is null or p_expected_version < 1
    or v_action.version <> p_expected_version or v_action.status <> 'pending'
    or v_action.batch_status <> 'awaiting_confirmation'
  then return jsonb_build_object('outcome', 'conflict'); end if;
  update public.action_proposals set status = 'rejected', version = version + 1
  where id = v_action.id and user_id = v_user_id;
  update public.proposal_batches set status = 'cancelled'
  where id = v_action.batch_id and user_id = v_user_id;
  return jsonb_build_object('outcome', 'rejected');
end;
$$;

revoke all on function public.job_drive_stage_rank(text) from public, anon, authenticated;
revoke all on function public.job_drive_json(uuid, uuid) from public, anon, authenticated;
revoke all on function public.apply_job_drive_change(uuid, timestamptz, jsonb, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.save_job_drive(uuid, timestamptz, jsonb, boolean, boolean) from public, anon;
revoke all on function public.persist_job_drive_proposal(uuid, text, text, text, text, text, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.confirm_job_drive_progress(uuid, integer, jsonb, boolean) from public, anon;
revoke all on function public.reject_job_drive_proposal(uuid, integer) from public, anon;

revoke execute on function public.persist_application_proposal(uuid, text, text, text, text, text, jsonb, jsonb, jsonb) from authenticated;
revoke execute on function public.confirm_create_application(uuid, integer, jsonb) from authenticated;
revoke execute on function public.reject_application_proposal(uuid, integer) from authenticated;

grant execute on function public.save_job_drive(uuid, timestamptz, jsonb, boolean, boolean) to authenticated;
grant execute on function public.persist_job_drive_proposal(uuid, text, text, text, text, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.confirm_job_drive_progress(uuid, integer, jsonb, boolean) to authenticated;
grant execute on function public.reject_job_drive_proposal(uuid, integer) to authenticated;
