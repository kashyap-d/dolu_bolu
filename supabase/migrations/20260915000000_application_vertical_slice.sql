alter table public.action_proposals
add column if not exists summary text;

update public.action_proposals
set summary = case kind
  when 'create_application' then 'Review application'
  when 'create_interview' then 'Review interview'
  when 'create_task' then 'Review task'
  else 'Review action'
end
where summary is null;

alter table public.action_proposals
alter column summary set not null;

alter table public.action_proposals
add constraint action_proposals_summary_length
check (char_length(summary) between 1 and 180);

alter table public.proposal_batches
add constraint proposal_batches_id_user_unique unique (id, user_id);

alter table public.applications
add constraint applications_id_user_unique unique (id, user_id);

alter table public.action_proposals
drop constraint action_proposals_batch_id_fkey;

alter table public.action_proposals
add constraint action_proposals_batch_owner_fkey
foreign key (batch_id, user_id)
references public.proposal_batches (id, user_id)
on delete cascade;

alter table public.interviews
drop constraint interviews_application_id_fkey;

alter table public.interviews
add constraint interviews_application_owner_fkey
foreign key (application_id, user_id)
references public.applications (id, user_id)
on delete set null (application_id);

alter table public.tasks
drop constraint tasks_application_id_fkey;

alter table public.tasks
add constraint tasks_application_owner_fkey
foreign key (application_id, user_id)
references public.applications (id, user_id)
on delete set null (application_id);

alter table public.action_proposals
add constraint action_proposals_execution_shape check (
  (
    status = 'executed'
    and executed_entity_type is not null
    and executed_entity_id is not null
  )
  or
  (
    status <> 'executed'
    and executed_entity_type is null
    and executed_entity_id is null
  )
);

alter table public.proposal_batches
add constraint proposal_batches_source_message_length
check (char_length(source_message) between 1 and 2000);

alter table public.applications
add constraint applications_company_trimmed check (company_name = btrim(company_name));

alter table public.applications
add constraint applications_role_trimmed check (role_title = btrim(role_title));

drop policy if exists "proposal_batches_manage_own" on public.proposal_batches;
drop policy if exists "action_proposals_manage_own" on public.action_proposals;
drop policy if exists "activity_events_insert_own" on public.activity_events;

create policy "proposal_batches_select_own"
on public.proposal_batches for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "action_proposals_select_own"
on public.action_proposals for select
to authenticated
using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.proposal_batches from anon, authenticated;
revoke insert, update, delete on public.action_proposals from anon, authenticated;
revoke insert, update, delete on public.activity_events from anon, authenticated;

create or replace function public.persist_application_proposal(
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
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_batch_id uuid;
  v_existing_message text;
  v_applied_at timestamptz;
  v_source_url text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if p_client_request_id is null
    or p_source_message is null
    or char_length(btrim(p_source_message)) not between 1 and 2000
    or nullif(btrim(p_provider), '') is null
    or char_length(btrim(p_provider)) > 40
    or nullif(btrim(p_model), '') is null
    or char_length(btrim(p_model)) > 100
    or p_action_ref is null
    or p_action_ref !~ '^draft:[1-5]$'
    or p_summary is null
    or char_length(btrim(p_summary)) not between 1 and 180
  then
    raise exception using errcode = '22023', message = 'INVALID_PROPOSAL';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_PROPOSAL';
  end if;

  if not p_payload ?& array[
      'companyName', 'roleTitle', 'status', 'appliedAt', 'sourceUrl', 'notes'
    ]
    or exists (
      select 1
      from jsonb_object_keys(p_payload) as payload_keys(payload_key)
      where payload_keys.payload_key not in (
        'companyName', 'roleTitle', 'status', 'appliedAt', 'sourceUrl', 'notes'
      )
    )
    or jsonb_typeof(p_payload -> 'companyName') <> 'string'
    or jsonb_typeof(p_payload -> 'roleTitle') <> 'string'
    or jsonb_typeof(p_payload -> 'status') <> 'string'
    or jsonb_typeof(p_payload -> 'appliedAt') not in ('string', 'null')
    or jsonb_typeof(p_payload -> 'sourceUrl') not in ('string', 'null')
    or jsonb_typeof(p_payload -> 'notes') not in ('string', 'null')
    or nullif(btrim(p_payload ->> 'companyName'), '') is null
    or char_length(p_payload ->> 'companyName') > 120
    or nullif(btrim(p_payload ->> 'roleTitle'), '') is null
    or char_length(p_payload ->> 'roleTitle') > 160
    or p_payload ->> 'status' not in ('saved', 'applied')
  then
    raise exception using errcode = '22023', message = 'INVALID_PROPOSAL';
  end if;

  if p_evidence is null or jsonb_typeof(p_evidence) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_PROPOSAL';
  end if;

  if jsonb_array_length(p_evidence) > 8 or exists (
    select 1
    from jsonb_array_elements(p_evidence) as evidence_items(evidence_item)
    where jsonb_typeof(evidence_items.evidence_item) <> 'object'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_PROPOSAL';
  end if;

  if exists (
      select 1
      from jsonb_array_elements(p_evidence) as evidence_items(evidence_item)
      where not evidence_items.evidence_item ?& array['fieldPath', 'quote']
        or exists (
          select 1
          from jsonb_object_keys(evidence_items.evidence_item)
            as evidence_keys(evidence_key)
          where evidence_keys.evidence_key not in ('fieldPath', 'quote')
        )
        or jsonb_typeof(evidence_items.evidence_item -> 'fieldPath') <> 'string'
        or char_length(evidence_items.evidence_item ->> 'fieldPath') not between 1 and 80
        or jsonb_typeof(evidence_items.evidence_item -> 'quote') <> 'string'
        or char_length(evidence_items.evidence_item ->> 'quote') not between 1 and 240
        or strpos(
          btrim(p_source_message),
          evidence_items.evidence_item ->> 'quote'
        ) = 0
    )
  then
    raise exception using errcode = '22023', message = 'INVALID_PROPOSAL';
  end if;

  if p_assumptions is null or jsonb_typeof(p_assumptions) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_PROPOSAL';
  end if;

  if jsonb_array_length(p_assumptions) > 8
    or exists (
      select 1
      from jsonb_array_elements(p_assumptions) as assumption_items(assumption_item)
      where jsonb_typeof(assumption_items.assumption_item) <> 'string'
        or char_length(assumption_items.assumption_item #>> '{}') not between 1 and 180
    )
  then
    raise exception using errcode = '22023', message = 'INVALID_PROPOSAL';
  end if;

  if p_payload ->> 'appliedAt' is not null then
    if (p_payload ->> 'appliedAt') !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?([zZ]|[+-][0-9]{2}:[0-9]{2})$'
    then
      raise exception using errcode = '22023', message = 'INVALID_PROPOSAL';
    end if;

    begin
      v_applied_at := (p_payload ->> 'appliedAt')::timestamptz;
    exception when others then
      raise exception using errcode = '22023', message = 'INVALID_PROPOSAL';
    end;
  end if;

  if (p_payload ->> 'status' = 'applied' and v_applied_at is null)
    or (p_payload ->> 'status' = 'saved' and v_applied_at is not null)
  then
    raise exception using errcode = '22023', message = 'INVALID_PROPOSAL';
  end if;

  v_source_url := nullif(btrim(p_payload ->> 'sourceUrl'), '');
  if (jsonb_typeof(p_payload -> 'sourceUrl') = 'string' and v_source_url is null)
    or (
      v_source_url is not null
      and (
        char_length(v_source_url) > 2048
        or v_source_url !~* '^https?://[^[:space:]]+$'
      )
    )
  then
    raise exception using errcode = '22023', message = 'INVALID_PROPOSAL';
  end if;

  if jsonb_typeof(p_payload -> 'notes') = 'string'
    and char_length(p_payload ->> 'notes') not between 1 and 2000
  then
    raise exception using errcode = '22023', message = 'INVALID_PROPOSAL';
  end if;

  insert into public.proposal_batches (
    user_id,
    client_request_id,
    source_message,
    provider,
    model,
    status
  ) values (
    v_user_id,
    p_client_request_id,
    btrim(p_source_message),
    btrim(p_provider),
    btrim(p_model),
    'awaiting_confirmation'
  )
  on conflict (user_id, client_request_id) do nothing
  returning id into v_batch_id;

  if v_batch_id is null then
    select pb.id, pb.source_message
    into v_batch_id, v_existing_message
    from public.proposal_batches as pb
    where pb.user_id = v_user_id
      and pb.client_request_id = p_client_request_id;

    if v_existing_message is distinct from btrim(p_source_message) then
      raise exception using errcode = '22023', message = 'REQUEST_ID_REUSED';
    end if;

    return query
    select
      ap.batch_id,
      ap.id,
      ap.version,
      ap.action_ref,
      ap.summary,
      ap.payload,
      ap.evidence,
      ap.assumptions
    from public.action_proposals as ap
    where ap.batch_id = v_batch_id
      and ap.user_id = v_user_id
      and ap.kind = 'create_application'
    order by ap.created_at
    limit 1;
    return;
  end if;

  return query
  insert into public.action_proposals (
    batch_id,
    user_id,
    action_ref,
    kind,
    summary,
    payload,
    evidence,
    assumptions,
    status,
    idempotency_key
  ) values (
    v_batch_id,
    v_user_id,
    p_action_ref,
    'create_application',
    btrim(p_summary),
    p_payload,
    p_evidence,
    p_assumptions,
    'pending',
    v_user_id::text || ':' || p_client_request_id::text || ':' || p_action_ref
  )
  returning
    action_proposals.batch_id,
    action_proposals.id,
    action_proposals.version,
    action_proposals.action_ref,
    action_proposals.summary,
    action_proposals.payload,
    action_proposals.evidence,
    action_proposals.assumptions;
end;
$$;

create or replace function public.confirm_create_application(
  p_action_id uuid,
  p_expected_version integer,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action record;
  v_application public.applications%rowtype;
  v_company_name text;
  v_role_title text;
  v_status text;
  v_applied_at timestamptz;
  v_source_url text;
  v_notes text;
begin
  if v_user_id is null then
    return jsonb_build_object('outcome', 'auth_required');
  end if;

  select
    ap.id,
    ap.batch_id,
    ap.version,
    ap.status,
    ap.kind,
    ap.executed_entity_type,
    ap.executed_entity_id,
    pb.status as batch_status
  into v_action
  from public.action_proposals as ap
  join public.proposal_batches as pb
    on pb.id = ap.batch_id
    and pb.user_id = ap.user_id
  where ap.id = p_action_id
    and ap.user_id = v_user_id
  for update of ap, pb;

  if not found or v_action.kind <> 'create_application' then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_action.status = 'executed'
    and v_action.executed_entity_type = 'application'
    and v_action.executed_entity_id is not null
  then
    select * into v_application
    from public.applications as applications
    where applications.id = v_action.executed_entity_id
      and applications.user_id = v_user_id;

    if not found then
      return jsonb_build_object('outcome', 'conflict');
    end if;

    return jsonb_build_object(
      'outcome', 'already_executed',
      'proposalId', v_action.id,
      'application', jsonb_build_object(
        'id', v_application.id,
        'companyName', v_application.company_name,
        'roleTitle', v_application.role_title,
        'status', v_application.status,
        'appliedAt', v_application.applied_at,
        'sourceUrl', v_application.source_url,
        'notes', v_application.notes,
        'createdAt', v_application.created_at,
        'updatedAt', v_application.updated_at
      )
    );
  end if;

  if p_expected_version is null
    or p_expected_version < 1
    or v_action.version <> p_expected_version
    or v_action.status <> 'pending'
    or v_action.batch_status <> 'awaiting_confirmation'
  then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('outcome', 'invalid_payload');
  end if;

  if not p_payload ?& array[
      'companyName', 'roleTitle', 'status', 'appliedAt', 'sourceUrl', 'notes'
    ]
    or exists (
      select 1
      from jsonb_object_keys(p_payload) as payload_keys(payload_key)
      where payload_keys.payload_key not in (
        'companyName', 'roleTitle', 'status', 'appliedAt', 'sourceUrl', 'notes'
      )
    )
    or jsonb_typeof(p_payload -> 'companyName') <> 'string'
    or jsonb_typeof(p_payload -> 'roleTitle') <> 'string'
    or jsonb_typeof(p_payload -> 'status') <> 'string'
    or jsonb_typeof(p_payload -> 'appliedAt') not in ('string', 'null')
    or jsonb_typeof(p_payload -> 'sourceUrl') not in ('string', 'null')
    or jsonb_typeof(p_payload -> 'notes') not in ('string', 'null')
  then
    return jsonb_build_object('outcome', 'invalid_payload');
  end if;

  v_company_name := btrim(p_payload ->> 'companyName');
  v_role_title := btrim(p_payload ->> 'roleTitle');
  v_status := p_payload ->> 'status';
  v_source_url := nullif(btrim(p_payload ->> 'sourceUrl'), '');
  v_notes := nullif(btrim(p_payload ->> 'notes'), '');

  if nullif(v_company_name, '') is null
    or char_length(v_company_name) > 120
    or nullif(v_role_title, '') is null
    or char_length(v_role_title) > 160
    or v_status not in ('saved', 'applied')
    or (jsonb_typeof(p_payload -> 'sourceUrl') = 'string' and v_source_url is null)
    or char_length(coalesce(v_source_url, '')) > 2048
    or (v_source_url is not null and v_source_url !~* '^https?://[^[:space:]]+$')
    or char_length(coalesce(v_notes, '')) > 2000
  then
    return jsonb_build_object('outcome', 'invalid_payload');
  end if;

  if p_payload ->> 'appliedAt' is not null then
    if (p_payload ->> 'appliedAt') !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?([zZ]|[+-][0-9]{2}:[0-9]{2})$'
    then
      return jsonb_build_object('outcome', 'invalid_payload');
    end if;

    begin
      v_applied_at := (p_payload ->> 'appliedAt')::timestamptz;
    exception when others then
      return jsonb_build_object('outcome', 'invalid_payload');
    end;
  end if;

  if (v_status = 'applied' and v_applied_at is null)
    or (v_status = 'saved' and v_applied_at is not null)
  then
    return jsonb_build_object('outcome', 'invalid_payload');
  end if;

  insert into public.applications (
    user_id,
    company_name,
    role_title,
    status,
    applied_at,
    source_url,
    notes
  ) values (
    v_user_id,
    v_company_name,
    v_role_title,
    v_status,
    v_applied_at,
    v_source_url,
    v_notes
  )
  returning * into v_application;

  update public.action_proposals
  set
    payload = p_payload,
    status = 'executed',
    version = version + 1,
    executed_entity_type = 'application',
    executed_entity_id = v_application.id,
    error_code = null
  where id = v_action.id
    and user_id = v_user_id;

  update public.proposal_batches as batches
  set status = 'executed'
  where batches.id = v_action.batch_id
    and batches.user_id = v_user_id
    and not exists (
      select 1
      from public.action_proposals as pending
      where pending.batch_id = batches.id
        and pending.user_id = v_user_id
        and pending.status = 'pending'
    );

  insert into public.activity_events (
    user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_user_id,
    'application_created',
    'application',
    v_application.id,
    jsonb_build_object(
      'source', 'assistant',
      'batchId', v_action.batch_id,
      'proposalId', v_action.id
    )
  );

  return jsonb_build_object(
    'outcome', 'executed',
    'proposalId', v_action.id,
    'application', jsonb_build_object(
      'id', v_application.id,
      'companyName', v_application.company_name,
      'roleTitle', v_application.role_title,
      'status', v_application.status,
      'appliedAt', v_application.applied_at,
      'sourceUrl', v_application.source_url,
      'notes', v_application.notes,
      'createdAt', v_application.created_at,
      'updatedAt', v_application.updated_at
    )
  );
end;
$$;

create or replace function public.reject_application_proposal(
  p_action_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action record;
begin
  if v_user_id is null then
    return jsonb_build_object('outcome', 'auth_required');
  end if;

  select
    ap.id,
    ap.batch_id,
    ap.version,
    ap.status,
    ap.kind,
    pb.status as batch_status
  into v_action
  from public.action_proposals as ap
  join public.proposal_batches as pb
    on pb.id = ap.batch_id
    and pb.user_id = ap.user_id
  where ap.id = p_action_id
    and ap.user_id = v_user_id
  for update of ap, pb;

  if not found or v_action.kind <> 'create_application' then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_action.status = 'rejected' then
    return jsonb_build_object('outcome', 'already_rejected');
  end if;

  if p_expected_version is null
    or p_expected_version < 1
    or v_action.version <> p_expected_version
    or v_action.status <> 'pending'
    or v_action.batch_status <> 'awaiting_confirmation'
  then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  update public.action_proposals
  set status = 'rejected', version = version + 1
  where id = v_action.id
    and user_id = v_user_id;

  update public.proposal_batches as batches
  set status = 'cancelled'
  where batches.id = v_action.batch_id
    and batches.user_id = v_user_id
    and not exists (
      select 1
      from public.action_proposals as pending
      where pending.batch_id = batches.id
        and pending.user_id = v_user_id
        and pending.status = 'pending'
    );

  return jsonb_build_object('outcome', 'rejected');
end;
$$;

revoke all on function public.persist_application_proposal(
  uuid, text, text, text, text, text, jsonb, jsonb, jsonb
) from public, anon;
revoke all on function public.confirm_create_application(
  uuid, integer, jsonb
) from public, anon;
revoke all on function public.reject_application_proposal(
  uuid, integer
) from public, anon;

grant execute on function public.persist_application_proposal(
  uuid, text, text, text, text, text, jsonb, jsonb, jsonb
) to authenticated;
grant execute on function public.confirm_create_application(
  uuid, integer, jsonb
) to authenticated;
grant execute on function public.reject_application_proposal(
  uuid, integer
) to authenticated;
