-- Invitation delivery is an explicit administrative operation. It does not
-- require granting clients direct writes or using service-role business CRUD.
create function public.set_invitation_delivery(p_id uuid,p_state text) returns void language plpgsql security definer set search_path='' as $$
declare mid uuid;
begin
  select merchant_id into mid from public.merchant_invitations where id=p_id;
  perform private.require_catalog_admin(mid);
  if p_state not in ('sent','failed') then raise exception 'VALIDATION_ERROR'; end if;
  update public.merchant_invitations set delivery_state=p_state where id=p_id;
end
$$;
revoke all on function public.set_invitation_delivery(uuid,text) from public,anon,authenticated;
grant execute on function public.set_invitation_delivery(uuid,text) to authenticated;

create or replace function public.create_invitation(p_merchant uuid,p_email text,p_role public.member_role,p_store_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare token text=encode(extensions.gen_random_bytes(32),'hex'); iid uuid; merchant_state public.merchant_status;
begin
  select status into merchant_state from public.merchants where id=p_merchant for update;
  perform private.require_catalog_admin(p_merchant);
  if merchant_state='rejected' or (merchant_state='pending' and p_role<>'admin') then raise exception 'FORBIDDEN'; end if;
  if length(p_email)>254 or p_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' then raise exception 'VALIDATION_ERROR'; end if;
  if (select count(*) from public.merchant_invitations where merchant_id=p_merchant and created_at>now()-interval '1 hour')>=60
    or exists(select 1 from public.merchant_invitations where merchant_id=p_merchant and email=lower(trim(p_email)) and created_at>now()-interval '1 minute' and delivery_state<>'failed' and revoked_at is null and accepted_at is null)
  then raise exception 'RATE_LIMITED'; end if;
  if p_store_ids is null or cardinality(p_store_ids)>100 or (p_role='admin' and cardinality(p_store_ids)>0) or exists(
    select 1 from unnest(p_store_ids) sid where not exists(select 1 from public.stores s where s.id=sid and s.merchant_id=p_merchant)
  ) then raise exception 'VALIDATION_ERROR'; end if;
  update public.merchant_invitations set revoked_at=now() where merchant_id=p_merchant and email=lower(trim(p_email)) and accepted_at is null and revoked_at is null;
  insert into public.merchant_invitations(merchant_id,email,role,token_hash) values(p_merchant,lower(trim(p_email)),p_role,encode(extensions.digest(token,'sha256'),'hex')) returning id into iid;
  insert into public.merchant_invitation_stores(merchant_id,invitation_id,store_id) select p_merchant,iid,sid from (select distinct unnest(p_store_ids) sid)x;
  return jsonb_build_object('id',iid,'token',token);
end
$$;
