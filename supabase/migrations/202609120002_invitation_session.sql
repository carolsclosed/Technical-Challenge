-- Accepting a verified, email-matched invitation records consent. It does not
-- unlock workplace data: store/team/order authorization still requires AAL2.
-- Keep this narrow exception separate from every privileged operation.
create or replace function public.invitation_details(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare inv public.merchant_invitations;
begin
  if not private.is_verified() then raise exception 'FORBIDDEN'; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'INVITATION_INVALID'; end if;
  select * into inv from public.merchant_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  perform private.check_invitation(inv);
  return jsonb_build_object('merchant_name',(select name from public.merchants where id=inv.merchant_id),'role',inv.role,'expires_at',inv.expires_at,
    'store_names',coalesce((select jsonb_agg(s.name order by s.name,s.id) from public.merchant_invitation_stores a join public.stores s on s.id=a.store_id where a.invitation_id=inv.id),'[]'::jsonb));
end
$$;

create or replace function public.accept_invitation(p_token text) returns text
language plpgsql security definer set search_path='' as $$
declare inv public.merchant_invitations; merchant_slug text; membership uuid;
begin
  if not private.is_verified() then raise exception 'FORBIDDEN'; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'INVITATION_INVALID'; end if;
  select * into inv from public.merchant_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  perform private.check_invitation(inv);
  -- Match the merchant-first lock order used by invitation creation/team edits.
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

revoke all on function public.invitation_details(text),public.accept_invitation(text) from public,anon,authenticated;
grant execute on function public.invitation_details(text),public.accept_invitation(text) to authenticated;
