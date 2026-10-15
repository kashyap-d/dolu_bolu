-- Interview rounds as a list (docs/decisions/0018). A drive already could
-- own several interview rows; v1 showed only the latest as one "phase".
-- Each row is now a round with a title, kind, and status.

alter table public.interviews disable trigger interviews_set_updated_at;

alter table public.interviews rename column stage to kind;
alter table public.interviews drop constraint interviews_stage_valid;
alter table public.interviews
  add constraint interviews_kind_valid check (kind in ('recruiter', 'technical', 'manager', 'hr', 'onsite', 'other')),
  add column title text not null default 'Interview',
  add column status text not null default 'scheduled',
  add constraint interviews_title_length check (char_length(title) between 1 and 120 and title = btrim(title)),
  add constraint interviews_status_valid check (status in ('scheduled', 'completed', 'cancelled'));

-- The old free-text round summary becomes part of the round's notes.
update public.interviews
set notes = left(nullif(concat_ws(E'\n\n', round_summary, notes), ''), 2000),
    status = case when starts_at is not null and starts_at < now() then 'completed' else 'scheduled' end;
alter table public.interviews drop column round_summary;

alter table public.interviews enable trigger interviews_set_updated_at;

create index interviews_drive_schedule_idx on public.interviews (user_id, job_drive_id, starts_at);

create or replace function public.job_drive_rounds_json(p_job_drive_id uuid, p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'title', i.title, 'kind', i.kind, 'status', i.status,
    'scheduledAt', i.starts_at, 'timeZone', i.timezone, 'mode', i.mode,
    'location', i.location, 'meetingUrl', i.meeting_url, 'notes', i.notes,
    'updatedAt', i.updated_at
  ) order by i.starts_at nulls last, i.created_at), '[]'::jsonb)
  from public.interviews as i
  where i.job_drive_id = p_job_drive_id and i.user_id = p_user_id;
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
    'interviewRounds', public.job_drive_rounds_json(drives.id, p_user_id),
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
  v_new public.job_drives%rowtype;
  v_assessment jsonb := p_payload -> 'assessment';
  v_rounds jsonb := p_payload -> 'interviewRounds';
  v_round jsonb;
  v_round_ids uuid[] := '{}';
  v_rounds_before jsonb;
  v_changed jsonb := '[]'::jsonb;
  v_duplicates jsonb;
  v_outcome text;
  v_is_backward boolean;
  v_written uuid;
begin
  if v_user_id is null then return jsonb_build_object('outcome', 'auth_required'); end if;

  -- Structure only. Value rules are table constraints.
  if p_job_drive_id is null or p_source not in ('manual', 'assistant')
    or not public.json_shape_is(p_payload, '{
      "companyName": ["string"], "roleTitle": ["string"], "stage": ["string"],
      "stageOccurredAt": ["string", "null"], "appliedAt": ["string", "null"],
      "applyBy": ["string", "null"], "location": ["string", "null"],
      "sourceUrl": ["string", "null"], "notes": ["string", "null"],
      "assessment": ["object", "null"], "interviewRounds": ["array"]
    }')
    or (jsonb_typeof(v_assessment) = 'object' and not public.json_shape_is(v_assessment, '{
      "status": ["string"], "availableFrom": ["string", "null"], "dueAt": ["string", "null"],
      "durationMinutes": ["number", "null"], "assessmentUrl": ["string", "null"], "notes": ["string", "null"]
    }'))
    or jsonb_array_length(v_rounds) > 10
    or exists (
      select 1 from jsonb_array_elements(v_rounds) as rounds(item)
      where not public.json_shape_is(rounds.item, '{
        "id": ["string"], "title": ["string"], "kind": ["string"], "status": ["string"],
        "scheduledAt": ["string", "null"], "timeZone": ["string", "null"], "mode": ["string"],
        "location": ["string", "null"], "meetingUrl": ["string", "null"], "notes": ["string", "null"]
      }')
    )
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
    v_rounds_before := '[]'::jsonb;
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
    v_rounds_before := public.job_drive_rounds_json(v_existing.id, v_user_id);

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

  -- The payload is the drive's complete list of rounds: upsert each by id,
  -- then remove rounds the user deleted.
  for v_round in select item from jsonb_array_elements(v_rounds) as rounds(item) loop
    v_written := null;
    insert into public.interviews as i (
      id, user_id, job_drive_id, company_name, role_title, title, kind, status,
      starts_at, timezone, mode, location, meeting_url, notes
    ) values (
      (v_round ->> 'id')::uuid, v_user_id, v_after.id, v_after.company_name, v_after.role_title,
      btrim(v_round ->> 'title'), v_round ->> 'kind', v_round ->> 'status',
      public.iso_timestamp(v_round ->> 'scheduledAt'),
      nullif(btrim(v_round ->> 'timeZone'), ''), v_round ->> 'mode',
      nullif(btrim(v_round ->> 'location'), ''), nullif(btrim(v_round ->> 'meetingUrl'), ''),
      nullif(btrim(v_round ->> 'notes'), '')
    )
    on conflict (id) do update set
      company_name = excluded.company_name, role_title = excluded.role_title,
      title = excluded.title, kind = excluded.kind, status = excluded.status,
      starts_at = excluded.starts_at, timezone = excluded.timezone, mode = excluded.mode,
      location = excluded.location, meeting_url = excluded.meeting_url, notes = excluded.notes
    -- An id that belongs to another user's or another drive's round is not ours to change.
    where i.user_id = v_user_id and i.job_drive_id = v_after.id
    returning i.id into v_written;
    if v_written is null then
      raise exception using errcode = 'check_violation', message = 'interview round id is not available';
    end if;
    v_round_ids := v_round_ids || v_written;
  end loop;

  delete from public.interviews as i
  where i.job_drive_id = v_after.id and i.user_id = v_user_id and not (i.id = any (v_round_ids));

  -- Compare without timestamps: an unchanged round may still be re-saved.
  if (select jsonb_agg(r - 'updatedAt') from jsonb_array_elements(public.job_drive_rounds_json(v_after.id, v_user_id)) as x(r))
    is distinct from (select jsonb_agg(r - 'updatedAt') from jsonb_array_elements(v_rounds_before) as x(r))
  then
    v_changed := v_changed || '"interviewRounds"'::jsonb;
  end if;

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

revoke all on function public.job_drive_rounds_json(uuid, uuid) from public, anon, authenticated;
