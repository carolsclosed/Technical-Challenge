-- One-table business writes use PostgREST with the caller's JWT. These grants
-- and policies keep authorization in PostgreSQL; multi-table transactions stay
-- behind their narrowly scoped database functions.

grant insert(name,slug) on public.merchants to authenticated;
grant update(name,status,rejection_reason) on public.merchants to authenticated;
grant insert(merchant_id,name,street,city,state,zip_code,phone,timezone,active) on public.stores to authenticated;
grant update(name,street,city,state,zip_code,phone,timezone,active) on public.stores to authenticated;
grant insert(merchant_id,store_id,name,description,price_minor,available) on public.products to authenticated;
grant update(name,description,price_minor,available,archived_at) on public.products to authenticated;
grant update(display_name,locale,theme) on public.profiles to authenticated;
grant update(revoked_at,delivery_state) on public.merchant_invitations to authenticated;

create policy profile_update on public.profiles for update to authenticated
  using(user_id=auth.uid() and private.customer_ok())
  with check(user_id=auth.uid() and private.customer_ok());

create policy merchant_insert on public.merchants for insert to authenticated
  with check(private.is_platform() and applicant_id is null and status='pending' and rejection_reason is null);

create policy merchant_applicant_read on public.merchants for select to authenticated
  using(applicant_id=auth.uid() and private.is_verified());

create policy merchant_update on public.merchants for update to authenticated
  using(
    private.is_platform()
    or private.member_ok(id,array['admin']::public.member_role[])
    or (applicant_id=auth.uid() and private.is_verified() and private.aal2() and status='rejected')
  )
  with check(
    private.is_platform()
    or private.member_ok(id,array['admin']::public.member_role[])
    or (applicant_id=auth.uid() and private.is_verified() and private.aal2())
  );

create policy store_insert on public.stores for insert to authenticated
  with check(private.is_platform() or private.member_ok(merchant_id,array['admin']::public.member_role[]));
create policy store_update on public.stores for update to authenticated
  using(private.is_platform() or private.member_ok(merchant_id,array['admin']::public.member_role[]))
  with check(private.is_platform() or private.member_ok(merchant_id,array['admin']::public.member_role[]));

create policy product_insert on public.products for insert to authenticated
  with check(private.store_ok(store_id,array['admin','staff']::public.member_role[]));
create policy product_update on public.products for update to authenticated
  using(private.store_ok(store_id))
  with check(private.store_ok(store_id));

create policy invitation_update on public.merchant_invitations for update to authenticated
  using(private.is_platform() or private.member_ok(merchant_id,array['admin']::public.member_role[]))
  with check(private.is_platform() or private.member_ok(merchant_id,array['admin']::public.member_role[]));

create function private.guard_merchant_sdk_update() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then return new; end if;
  if new.id<>old.id or new.slug<>old.slug or new.applicant_id is distinct from old.applicant_id
    or new.created_at<>old.created_at then raise exception 'FORBIDDEN'; end if;
  if new.status is distinct from old.status or new.rejection_reason is distinct from old.rejection_reason then
    if private.is_platform() then
      if new.status is not distinct from old.status
        or not ((old.status='pending' and new.status in ('active','rejected'))
          or (old.status='active' and new.status='suspended')
          or (old.status='suspended' and new.status='active'))
      then raise exception 'CONFLICT'; end if;
      if new.status='active' and not exists(
        select 1 from public.merchant_memberships
        where merchant_id=old.id and active and role='admin'
      ) then raise exception 'LAST_ADMIN_REQUIRED'; end if;
      if new.status='rejected' and coalesce(length(trim(new.rejection_reason)),0) not between 2 and 500
      then raise exception 'VALIDATION_ERROR'; end if;
      if new.status<>'rejected' and new.rejection_reason is not null
      then raise exception 'VALIDATION_ERROR'; end if;
      return new;
    elsif old.applicant_id=auth.uid() and old.status='rejected' and new.status='pending'
      and new.rejection_reason is null and private.is_verified() and private.aal2() then
      return new;
    else
      raise exception 'FORBIDDEN';
    end if;
  end if;
  if new.name is distinct from old.name
    and not (private.is_platform() or private.member_ok(old.id,array['admin']::public.member_role[]))
  then raise exception 'FORBIDDEN'; end if;
  return new;
end
$$;
create trigger guard_merchant_sdk_update before update on public.merchants
  for each row execute function private.guard_merchant_sdk_update();

create function private.guard_product_sdk_update() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then return new; end if;
  if new.id<>old.id or new.merchant_id<>old.merchant_id or new.store_id<>old.store_id
    or new.created_at<>old.created_at then raise exception 'FORBIDDEN'; end if;
  if old.archived_at is not null and new.archived_at is distinct from old.archived_at
  then raise exception 'FORBIDDEN'; end if;
  if new.archived_at is distinct from old.archived_at
    or new.name is distinct from old.name
    or new.description is distinct from old.description
    or new.price_minor is distinct from old.price_minor then
    if not private.store_ok(old.store_id,array['admin','staff']::public.member_role[]) then raise exception 'FORBIDDEN'; end if;
  elsif new.available is distinct from old.available then
    if not private.store_ok(old.store_id) then raise exception 'FORBIDDEN'; end if;
  end if;
  return new;
end
$$;
create trigger guard_product_sdk_update before update on public.products
  for each row execute function private.guard_product_sdk_update();

create function private.guard_invitation_sdk_update() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then return new; end if;
  if new.id<>old.id or new.merchant_id<>old.merchant_id or new.email<>old.email
    or new.role<>old.role or new.token_hash<>old.token_hash or new.expires_at<>old.expires_at
    or new.created_at<>old.created_at
  then raise exception 'FORBIDDEN'; end if;
  if new.accepted_at is distinct from old.accepted_at then
    if old.accepted_at is not null or new.accepted_at is null
      or new.email is distinct from (select lower(email) from auth.users where id=auth.uid())
      or not private.is_verified()
    then raise exception 'FORBIDDEN'; end if;
    return new;
  end if;
  if new.delivery_state not in ('sent','failed') then raise exception 'VALIDATION_ERROR'; end if;
  return new;
end
$$;
create trigger guard_invitation_sdk_update before update on public.merchant_invitations
  for each row execute function private.guard_invitation_sdk_update();

revoke all on function private.guard_merchant_sdk_update(),private.guard_product_sdk_update(),private.guard_invitation_sdk_update()
  from public,anon,authenticated;
