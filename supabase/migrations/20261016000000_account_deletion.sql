-- Lets a signed-in user permanently delete their own account
-- (docs/decisions/0013). Every user-owned table references auth.users with
-- ON DELETE CASCADE, so removing the auth row removes all of their data.

create or replace function public.delete_my_account(p_confirmation text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return jsonb_build_object('outcome', 'auth_required'); end if;
  -- A deliberate phrase, so a stray or replayed request cannot delete an account.
  if p_confirmation is distinct from 'delete my account' then
    return jsonb_build_object('outcome', 'confirmation_required');
  end if;
  delete from auth.users where id = v_user_id;
  return jsonb_build_object('outcome', 'deleted');
end;
$$;

revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
