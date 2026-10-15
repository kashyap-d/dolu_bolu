-- Pasted emails and invites (docs/decisions/0020): allow source messages up
-- to 8,000 characters. The function is otherwise unchanged from
-- 20260916000000_job_drive_foundation.sql. Contact details are removed by the
-- application before a message is stored.

alter table public.proposal_batches drop constraint proposal_batches_source_message_length;
alter table public.proposal_batches add constraint proposal_batches_source_message_length
  check (char_length(source_message) between 1 and 8000);

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
    or char_length(btrim(coalesce(p_source_message, ''))) not between 1 and 8000
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
