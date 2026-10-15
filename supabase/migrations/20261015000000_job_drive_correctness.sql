-- Phase 2 correctness (docs/decisions/0004, 0009, 0017):
--   1. timestamp defaults no longer depend on the session time zone;
--   2. appliedAt / applyBy become calendar dates;
--   3. value rules live in table constraints, defined once;
--   4. duplicate detection compares normalised company and role names;
--   5. apply_job_drive_change keeps only structure checks, locking, the
--      write, and the activity append.

-- 1. timezone('utc', now()) yields a timestamp *without* time zone, which a
-- timestamptz column then reinterprets in the session's zone. now() is exact.
do $$
declare
  col record;
begin
  for col in
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and column_default = 'timezone(''utc''::text, now())'
  loop
    execute format('alter table public.%I alter column %I set default now()', col.table_name, col.column_name);
  end loop;
end $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. Day-precision facts. Existing values convert in the owner's profile
-- time zone, so "applied on the 13th" stays the 13th.
alter table public.job_drives disable trigger job_drives_set_updated_at;
alter table public.job_drives add column applied_on date, add column apply_by_date date;
update public.job_drives as d
set applied_on = (d.applied_at at time zone coalesce(p.timezone, 'UTC'))::date,
    apply_by_date = (d.apply_by at time zone coalesce(p.timezone, 'UTC'))::date
from public.job_drives as source
left join public.profiles as p on p.id = source.user_id
where source.id = d.id;
alter table public.job_drives drop column applied_at, drop column apply_by;
alter table public.job_drives rename column applied_on to applied_at;
alter table public.job_drives rename column apply_by_date to apply_by;
alter table public.job_drives enable trigger job_drives_set_updated_at;

-- 3. Value rules, once. Functions translate violations into invalid_payload.
create or replace function public.is_http_url(p_value text)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select p_value ~* '^https?://[^[:space:]]+$' and char_length(p_value) <= 2048;
$$;

create or replace function public.is_time_zone(p_value text)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
begin
  perform now() at time zone p_value;
  return char_length(p_value) between 1 and 80;
exception when others then
  return false;
end;
$$;

alter table public.job_drives
  add constraint job_drives_source_url_valid check (source_url is null or public.is_http_url(source_url)),
  add constraint job_drives_notes_length check (notes is null or char_length(notes) between 1 and 2000);

alter table public.job_drive_assessments
  add constraint job_drive_assessments_url_valid check (assessment_url is null or public.is_http_url(assessment_url));

alter table public.interviews
  add constraint interviews_timezone_valid check (timezone is null or public.is_time_zone(timezone)),
  add constraint interviews_schedule_has_timezone check (starts_at is null or timezone is not null),
  add constraint interviews_meeting_url_valid check (meeting_url is null or public.is_http_url(meeting_url)),
  add constraint interviews_location_length check (location is null or char_length(location) between 1 and 240),
  add constraint interviews_notes_length check (notes is null or char_length(notes) between 1 and 2000);

-- 4. Normalised names for duplicate detection. Mirrored exactly by
-- src/features/job-drives/normalize.ts; tests/db/normalize.test.ts checks parity.
create or replace function public.normalize_company_name(p_value text)
returns text language plpgsql immutable security invoker set search_path = '' as $$
declare
  v text := lower(coalesce(p_value, ''));
  v_previous text;
begin
  v := replace(v, '&', ' and ');
  v := regexp_replace(v, '[^a-z0-9]+', ' ', 'g');
  v := btrim(regexp_replace(v, '\s+', ' ', 'g'));
  v := regexp_replace(v, '^the ', '');
  loop
    v_previous := v;
    v := regexp_replace(
      v,
      ' (private limited|pvt ltd|pvt|ltd|limited|inc|incorporated|llc|llp|plc|corp|corporation|co|company|gmbh)$',
      ''
    );
    exit when v = v_previous;
  end loop;
  -- Names with no ASCII letters or digits keep their original form.
  return coalesce(nullif(v, ''), lower(btrim(coalesce(p_value, ''))));
end;
$$;

create or replace function public.normalize_role_title(p_value text)
returns text language plpgsql immutable security invoker set search_path = '' as $$
declare
  v text := lower(coalesce(p_value, ''));
begin
  v := regexp_replace(v, '[^a-z0-9]+', ' ', 'g');
  v := btrim(regexp_replace(v, '\s+', ' ', 'g'));
  v := regexp_replace(v, '(^| )sr(?= |$)', '\1senior', 'g');
  v := regexp_replace(v, '(^| )jr(?= |$)', '\1junior', 'g');
  v := regexp_replace(v, '(^| )swe(?= |$)', '\1software engineer', 'g');
  v := regexp_replace(v, '(^| )sde(?= |$)', '\1software development engineer', 'g');
  return coalesce(nullif(v, ''), lower(btrim(coalesce(p_value, ''))));
end;
$$;

create index job_drives_user_company_key_idx
  on public.job_drives (user_id, public.normalize_company_name(company_name));

-- 5. The write path.
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
        'nextScheduledAt', i.starts_at, 'timeZone', i.timezone,
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

-- True when `p_object` has exactly `p_types`' keys and each value has an allowed JSON type.
create or replace function public.json_shape_is(p_object jsonb, p_types jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
begin
  if p_object is null or jsonb_typeof(p_object) <> 'object' then return false; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(p_object) as keys(k))
    is distinct from (select array_agg(k order by k) from jsonb_object_keys(p_types) as keys(k))
  then return false; end if;
  return not exists (
    select 1 from jsonb_each(p_types) as expected(key, allowed)
    where not (expected.allowed ? jsonb_typeof(p_object -> expected.key))
  );
end;
$$;

-- Postgres accepts 'now', 'yesterday', 'infinity', … as dates; the API does not.
create or replace function public.iso_timestamp(p_value text)
returns timestamptz language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_value is null then return null; end if;
  if p_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})$' then
    raise exception using errcode = 'invalid_datetime_format', message = 'Expected an ISO 8601 timestamp with offset';
  end if;
  return p_value::timestamptz;
end;
$$;

create or replace function public.iso_date(p_value text)
returns date language plpgsql immutable security invoker set search_path = '' as $$
begin
  if p_value is null then return null; end if;
  if p_value !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception using errcode = 'invalid_datetime_format', message = 'Expected an ISO 8601 date';
  end if;
  return p_value::date;
end;
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
  v_new public.job_drives%rowtype;
  v_assessment jsonb := p_payload -> 'assessment';
  v_interview jsonb := p_payload -> 'interview';
  v_interview_id uuid;
  v_changed jsonb := '[]'::jsonb;
  v_duplicates jsonb;
  v_outcome text;
  v_is_backward boolean;
begin
  if v_user_id is null then return jsonb_build_object('outcome', 'auth_required'); end if;

  -- Structure only. Value rules are table constraints.
  if p_job_drive_id is null or p_source not in ('manual', 'assistant')
    or not public.json_shape_is(p_payload, '{
      "companyName": ["string"], "roleTitle": ["string"], "stage": ["string"],
      "stageOccurredAt": ["string", "null"], "appliedAt": ["string", "null"],
      "applyBy": ["string", "null"], "location": ["string", "null"],
      "sourceUrl": ["string", "null"], "notes": ["string", "null"],
      "assessment": ["object", "null"], "interview": ["object", "null"]
    }')
    or (jsonb_typeof(v_assessment) = 'object' and not public.json_shape_is(v_assessment, '{
      "status": ["string"], "availableFrom": ["string", "null"], "dueAt": ["string", "null"],
      "durationMinutes": ["number", "null"], "assessmentUrl": ["string", "null"], "notes": ["string", "null"]
    }'))
    or (jsonb_typeof(v_interview) = 'object' and not public.json_shape_is(v_interview, '{
      "nextScheduledAt": ["string", "null"], "timeZone": ["string", "null"], "mode": ["string"],
      "location": ["string", "null"], "meetingUrl": ["string", "null"],
      "roundSummary": ["string", "null"], "notes": ["string", "null"]
    }'))
  then return jsonb_build_object('outcome', 'invalid_payload'); end if;

  v_new.company_name := btrim(p_payload ->> 'companyName');
  v_new.role_title := btrim(p_payload ->> 'roleTitle');
  v_new.stage := p_payload ->> 'stage';
  v_new.stage_occurred_at := public.iso_timestamp(p_payload ->> 'stageOccurredAt');
  v_new.applied_at := public.iso_date(p_payload ->> 'appliedAt');
  v_new.apply_by := public.iso_date(p_payload ->> 'applyBy');
  v_new.location := nullif(btrim(p_payload ->> 'location'), '');
  v_new.source_url := nullif(btrim(p_payload ->> 'sourceUrl'), '');
  v_new.notes := nullif(btrim(p_payload ->> 'notes'), '');

  select * into v_existing from public.job_drives as d
  where d.id = p_job_drive_id and d.user_id = v_user_id for update;

  if found and p_expected_updated_at is null then
    -- A replayed create returns the original result.
    if v_existing.company_name = v_new.company_name and v_existing.role_title = v_new.role_title
      and v_existing.stage = v_new.stage
    then
      return jsonb_build_object('outcome', 'already_created', 'jobDrive', public.job_drive_json(v_existing.id, v_user_id));
    end if;
    return jsonb_build_object('outcome', 'conflict');
  end if;

  if not found then
    if p_expected_updated_at is not null then return jsonb_build_object('outcome', 'not_found'); end if;
    if exists (select 1 from public.job_drives as d where d.id = p_job_drive_id) then
      return jsonb_build_object('outcome', 'conflict');
    end if;

    insert into public.job_drives (
      id, user_id, company_name, role_title, stage, stage_occurred_at,
      applied_at, apply_by, location, source_url, notes
    ) values (
      p_job_drive_id, v_user_id, v_new.company_name, v_new.role_title, v_new.stage,
      v_new.stage_occurred_at, v_new.applied_at, v_new.apply_by, v_new.location,
      v_new.source_url, v_new.notes
    ) returning * into v_after;
    v_outcome := 'created';
  else
    if v_existing.updated_at <> p_expected_updated_at then
      return jsonb_build_object('outcome', 'conflict');
    end if;
    v_is_backward := v_new.stage <> v_existing.stage and (
      v_existing.stage in ('accepted', 'rejected', 'withdrawn')
      or public.job_drive_stage_rank(v_new.stage) < public.job_drive_stage_rank(v_existing.stage)
    );
    if v_is_backward and not p_is_correction then
      return jsonb_build_object('outcome', 'correction_required');
    end if;

    update public.job_drives set company_name = v_new.company_name, role_title = v_new.role_title,
      stage = v_new.stage, stage_occurred_at = v_new.stage_occurred_at,
      applied_at = v_new.applied_at, apply_by = v_new.apply_by, location = v_new.location,
      source_url = v_new.source_url, notes = v_new.notes
    where id = v_existing.id and user_id = v_user_id returning * into v_after;
    v_outcome := 'updated';
  end if;

  select coalesce(jsonb_agg(field), '[]'::jsonb) into v_changed
  from (values
    ('companyName', v_existing.company_name is distinct from v_after.company_name),
    ('roleTitle', v_existing.role_title is distinct from v_after.role_title),
    ('stage', v_existing.stage is distinct from v_after.stage),
    ('stageOccurredAt', v_existing.stage_occurred_at is distinct from v_after.stage_occurred_at),
    ('appliedAt', v_existing.applied_at is distinct from v_after.applied_at),
    ('applyBy', v_existing.apply_by is distinct from v_after.apply_by),
    ('location', v_existing.location is distinct from v_after.location),
    ('sourceUrl', v_existing.source_url is distinct from v_after.source_url),
    ('notes', v_existing.notes is distinct from v_after.notes)
  ) as fields(field, changed)
  where changed;

  if jsonb_typeof(v_assessment) = 'object' then
    insert into public.job_drive_assessments (
      job_drive_id, user_id, status, available_from, due_at, duration_minutes, assessment_url, notes
    ) values (
      v_after.id, v_user_id, v_assessment ->> 'status',
      public.iso_timestamp(v_assessment ->> 'availableFrom'),
      public.iso_timestamp(v_assessment ->> 'dueAt'),
      (v_assessment ->> 'durationMinutes')::integer,
      nullif(btrim(v_assessment ->> 'assessmentUrl'), ''),
      nullif(btrim(v_assessment ->> 'notes'), '')
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
      insert into public.interviews (user_id, job_drive_id, company_name, role_title, stage, mode)
      values (v_user_id, v_after.id, v_after.company_name, v_after.role_title, 'other', 'unknown')
      returning id into v_interview_id;
    end if;
    update public.interviews set company_name = v_after.company_name, role_title = v_after.role_title,
      starts_at = public.iso_timestamp(v_interview ->> 'nextScheduledAt'),
      timezone = nullif(btrim(v_interview ->> 'timeZone'), ''),
      mode = v_interview ->> 'mode',
      location = nullif(btrim(v_interview ->> 'location'), ''),
      meeting_url = nullif(btrim(v_interview ->> 'meetingUrl'), ''),
      round_summary = nullif(btrim(v_interview ->> 'roundSummary'), ''),
      notes = nullif(btrim(v_interview ->> 'notes'), '')
    where id = v_interview_id and user_id = v_user_id;
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
      'occurredAt', v_after.stage_occurred_at
    )
  );
  -- Checked last, so invalid input is reported as invalid rather than as a
  -- duplicate. Raising DL001 rolls back everything this call wrote.
  if v_outcome = 'created' and not p_allow_possible_duplicate then
    select coalesce(jsonb_agg(candidate), '[]'::jsonb) into v_duplicates
    from (
      select jsonb_build_object(
        'id', d.id, 'companyName', d.company_name, 'roleTitle', d.role_title,
        'stage', d.stage, 'location', d.location, 'sourceUrl', d.source_url,
        'updatedAt', d.updated_at
      ) as candidate
      from public.job_drives as d
      where d.user_id = v_user_id and d.id <> v_after.id
        and d.stage not in ('accepted', 'rejected', 'withdrawn')
        and ((v_after.source_url is not null and lower(d.source_url) = lower(v_after.source_url))
          or (public.normalize_company_name(d.company_name) = public.normalize_company_name(v_after.company_name)
            and public.normalize_role_title(d.role_title) = public.normalize_role_title(v_after.role_title)
            and (v_after.location is null or d.location is null or lower(d.location) = lower(v_after.location))))
      order by d.updated_at desc limit 5
    ) as duplicate_rows;
    if jsonb_array_length(v_duplicates) > 0 then
      raise exception using errcode = 'DL001', message = 'possible duplicate';
    end if;
  end if;

  return jsonb_build_object('outcome', v_outcome, 'jobDrive', public.job_drive_json(v_after.id, v_user_id));
exception
  when sqlstate 'DL001' then
    return jsonb_build_object('outcome', 'possible_duplicate', 'candidates', v_duplicates);
  -- Any value the constraints or casts reject: nothing above is kept.
  when check_violation or not_null_violation or invalid_text_representation
    or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range
    or string_data_right_truncation
  then
    return jsonb_build_object('outcome', 'invalid_payload');
end;
$$;

revoke all on function public.is_http_url(text) from public, anon;
revoke all on function public.is_time_zone(text) from public, anon;
revoke all on function public.json_shape_is(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.iso_timestamp(text) from public, anon, authenticated;
revoke all on function public.iso_date(text) from public, anon, authenticated;
revoke all on function public.normalize_company_name(text) from public, anon;
revoke all on function public.normalize_role_title(text) from public, anon;
