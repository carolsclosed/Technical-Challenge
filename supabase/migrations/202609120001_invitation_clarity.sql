-- Invitations must be actionable before an email is sent. Keep the one-merchant
-- membership constraint and explain eligibility failures separately from edits.
create or replace function public.create_invitation(p_merchant uuid,p_email text,p_role public.member_role,p_store_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  token text=encode(extensions.gen_random_bytes(32),'hex');
  iid uuid; merchant_row public.merchants; invited_user uuid; existing_merchant uuid;
begin
  select * into merchant_row from public.merchants where id=p_merchant for update;
  perform private.require_catalog_admin(p_merchant);
  if merchant_row.status in ('rejected','suspended') or (merchant_row.status='pending' and p_role<>'admin') then raise exception 'FORBIDDEN'; end if;
  if p_email is null or length(p_email)>254 or trim(p_email) !~ '^[^ @]+@[^ @]+\.[^ @]+$' or p_role is null then raise exception 'VALIDATION_ERROR'; end if;
  if p_store_ids is null or cardinality(p_store_ids)>100 or (p_role='admin' and cardinality(p_store_ids)>0) or exists(
    select 1 from unnest(p_store_ids) sid where not exists(select 1 from public.stores s where s.id=sid and s.merchant_id=p_merchant)
  ) then raise exception 'VALIDATION_ERROR'; end if;
  select id into invited_user from auth.users where lower(email)=lower(trim(p_email));
  select merchant_id into existing_merchant from public.merchant_memberships where user_id=invited_user;
  if existing_merchant=p_merchant then raise exception 'INVITATION_ALREADY_MEMBER'; end if;
  if existing_merchant is not null or exists(select 1 from public.platform_admins where user_id=invited_user) then raise exception 'INVITATION_ACCOUNT_IN_USE'; end if;
  if (select count(*) from public.merchant_invitations where merchant_id=p_merchant and created_at>now()-interval '1 hour')>=60
    or exists(select 1 from public.merchant_invitations where merchant_id=p_merchant and email=lower(trim(p_email)) and created_at>now()-interval '1 minute' and delivery_state<>'failed' and revoked_at is null and accepted_at is null)
  then raise exception 'RATE_LIMITED'; end if;
  update public.merchant_invitations set revoked_at=now() where merchant_id=p_merchant and email=lower(trim(p_email)) and accepted_at is null and revoked_at is null;
  insert into public.merchant_invitations(merchant_id,email,role,token_hash)
    values(p_merchant,lower(trim(p_email)),p_role,encode(extensions.digest(token,'sha256'),'hex')) returning id into iid;
  insert into public.merchant_invitation_stores(merchant_id,invitation_id,store_id)
    select p_merchant,iid,sid from (select distinct unnest(p_store_ids) sid)x;
  -- These names come from authorized database records, never from email input.
  return jsonb_build_object('id',iid,'token',token,'merchant_name',merchant_row.name,'role',p_role,
    'store_names',coalesce((select jsonb_agg(s.name order by s.name,s.id) from public.stores s where s.id=any(p_store_ids)),'[]'::jsonb));
end
$$;

create function private.check_invitation(inv public.merchant_invitations) returns void
language plpgsql security definer set search_path='' as $$
declare existing_merchant uuid;
begin
  if not private.is_verified() then raise exception 'FORBIDDEN'; end if;
  if inv.id is null then raise exception 'INVITATION_INVALID'; end if;
  if inv.email is distinct from (select lower(email) from auth.users where id=auth.uid()) then raise exception 'INVITATION_EMAIL_MISMATCH'; end if;
  if inv.expires_at<=now() or inv.accepted_at is not null or inv.revoked_at is not null then raise exception 'INVITATION_INVALID'; end if;
  select merchant_id into existing_merchant from public.merchant_memberships where user_id=auth.uid();
  if existing_merchant=inv.merchant_id then raise exception 'INVITATION_ALREADY_MEMBER'; end if;
  if existing_merchant is not null or exists(select 1 from public.platform_admins where user_id=auth.uid()) then raise exception 'INVITATION_ACCOUNT_IN_USE'; end if;
  if not exists(select 1 from public.merchants where id=inv.merchant_id and (status='active' or (status='pending' and inv.role='admin'))) then raise exception 'INVITATION_UNAVAILABLE'; end if;
end
$$;
revoke all on function private.check_invitation(public.merchant_invitations) from public,anon,authenticated;

-- The invitee can review only the invitation matching their verified email.
-- This grants no workplace access; acceptance still requires AAL2.
create function public.invitation_details(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare inv public.merchant_invitations;
begin
  if not private.customer_ok() then raise exception 'FORBIDDEN'; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'INVITATION_INVALID'; end if;
  select * into inv from public.merchant_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  perform private.check_invitation(inv);
  return jsonb_build_object('merchant_name',(select name from public.merchants where id=inv.merchant_id),'role',inv.role,'expires_at',inv.expires_at,
    'store_names',coalesce((select jsonb_agg(s.name order by s.name,s.id) from public.merchant_invitation_stores a join public.stores s on s.id=a.store_id where a.invitation_id=inv.id),'[]'::jsonb));
end
$$;
revoke all on function public.invitation_details(text) from public,anon,authenticated;
grant execute on function public.invitation_details(text) to authenticated;

create or replace function public.accept_invitation(p_token text) returns text
language plpgsql security definer set search_path='' as $$
declare inv public.merchant_invitations; merchant_slug text; membership uuid;
begin
  if not private.is_verified() or not private.aal2() then raise exception 'FORBIDDEN'; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'INVITATION_INVALID'; end if;
  select * into inv from public.merchant_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  perform private.check_invitation(inv);
  -- Match the merchant-first order used by invitation creation and team edits.
  -- Recheck after locking: expiry, revocation and membership can change in flight.
  perform 1 from public.merchants where id=inv.merchant_id for update;
  perform 1 from auth.users where id=auth.uid() for update;
  select * into inv from public.merchant_invitations where id=inv.id for update;
  perform private.check_invitation(inv);
  insert into public.merchant_memberships(merchant_id,user_id,role) values(inv.merchant_id,auth.uid(),inv.role) returning id into membership;
  insert into public.merchant_store_assignments(merchant_id,membership_id,store_id)
    select inv.merchant_id,membership,s.store_id from public.merchant_invitation_stores s where s.invitation_id=inv.id;
  update public.merchant_invitations set accepted_at=now() where id=inv.id;
  select m.slug into merchant_slug from public.merchants m where m.id=inv.merchant_id;
  return merchant_slug;
end
$$;
