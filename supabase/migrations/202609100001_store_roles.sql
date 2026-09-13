-- Staff/operators work only at stores explicitly assigned by an administrator.
alter table public.merchant_memberships add constraint membership_tenant_id unique(merchant_id,id);
alter table public.merchant_invitations add constraint invitation_tenant_id unique(merchant_id,id);

create table public.merchant_store_assignments (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null,
  membership_id uuid not null,
  store_id uuid not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(membership_id,store_id),
  foreign key(merchant_id,membership_id) references public.merchant_memberships(merchant_id,id),
  foreign key(merchant_id,store_id) references public.stores(merchant_id,id)
);
create table public.merchant_invitation_stores (
  merchant_id uuid not null,
  invitation_id uuid not null,
  store_id uuid not null,
  primary key(invitation_id,store_id),
  foreign key(merchant_id,invitation_id) references public.merchant_invitations(merchant_id,id),
  foreign key(merchant_id,store_id) references public.stores(merchant_id,id)
);
create index on public.merchant_store_assignments(store_id,membership_id) where active;
alter table public.merchant_store_assignments enable row level security;
alter table public.merchant_invitation_stores enable row level security;
revoke all on public.merchant_store_assignments,public.merchant_invitation_stores from public,anon,authenticated;
grant select on public.merchant_store_assignments to authenticated;

create function private.store_ok(sid uuid,roles public.member_role[] default array['admin','staff','operator']::public.member_role[],fulfillment boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.stores s
    where s.id=sid and (
      (not fulfillment and private.is_platform()) or
      (private.member_ok(s.merchant_id,roles,fulfillment) and exists(
        select 1 from public.merchant_memberships mm where mm.user_id=auth.uid() and mm.merchant_id=s.merchant_id and mm.active
          and (mm.role='admin' or exists(select 1 from public.merchant_store_assignments a where a.membership_id=mm.id and a.store_id=s.id and a.active))
      ))
    )
  )
$$;
create function private.require_store(sid uuid,roles public.member_role[] default array['admin','staff','operator']::public.member_role[],fulfillment boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin if not private.store_ok(sid,roles,fulfillment) then raise exception 'FORBIDDEN'; end if; end
$$;
create function private.require_catalog_admin(mid uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.is_platform() then perform private.require_member(mid,array['admin']::public.member_role[]); end if;
  if not exists(select 1 from public.merchants where id=mid) then raise exception 'NOT_FOUND'; end if;
end
$$;
revoke all on function private.store_ok(uuid,public.member_role[],boolean),private.require_store(uuid,public.member_role[],boolean),private.require_catalog_admin(uuid) from public,anon,authenticated;
grant execute on function private.store_ok(uuid,public.member_role[],boolean) to authenticated;

drop policy stores_read on public.stores;
create policy stores_read on public.stores for select to authenticated
  using(private.is_platform() or private.store_ok(id,array['admin','staff','operator']::public.member_role[],true));
drop policy products_read on public.products;
create policy products_read on public.products for select to authenticated using(private.store_ok(store_id));
drop policy membership_read on public.merchant_memberships;
create policy membership_read on public.merchant_memberships for select to authenticated using(
  private.is_platform() or private.member_ok(merchant_id,array['admin']::public.member_role[]) or
  (user_id=auth.uid() and private.member_ok(merchant_id,array['admin','staff','operator']::public.member_role[],true))
);
create policy assignment_read on public.merchant_store_assignments for select to authenticated using(
  private.is_platform() or private.member_ok(merchant_id,array['admin']::public.member_role[]) or
  (private.member_ok(merchant_id,array['staff','operator']::public.member_role[],true) and exists(select 1 from public.merchant_memberships mm where mm.id=membership_id and mm.user_id=auth.uid()))
);
drop policy orders_read on public.store_orders;
create policy orders_read on public.store_orders for select to authenticated using(
  (customer_id=auth.uid() and private.customer_ok()) or private.store_ok(store_id,array['admin','staff','operator']::public.member_role[],true)
);
create or replace function private.order_read(oid uuid) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.store_orders o where o.id=oid and (
  (o.customer_id=auth.uid() and private.customer_ok()) or private.store_ok(o.store_id,array['admin','staff','operator']::public.member_role[],true)
))
$$;
-- Platform administrators can audit the catalog/team changes they administer.
drop policy audit_read on public.audit_events;
create policy audit_read on public.audit_events for select to authenticated using(private.is_platform() or private.member_ok(merchant_id,array['admin']::public.member_role[]));
create trigger immutable_owner before update on public.merchant_store_assignments for each row execute function private.immutable_owner();
create trigger audit after insert or update on public.merchant_store_assignments for each row execute function private.audit();

create or replace function public.session_context() returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
  'platform',exists(select 1 from public.platform_admins where user_id=auth.uid() and active),
  'has_membership',exists(select 1 from public.merchant_memberships where user_id=auth.uid()),
  'membership',(select jsonb_build_object('merchant_id',m.id,'slug',m.slug,'name',m.name,'status',m.status,'role',mm.role)
    from public.merchant_memberships mm join public.merchants m on m.id=mm.merchant_id where mm.user_id=auth.uid() and mm.active)
)
$$;

create or replace function public.create_store(p_merchant uuid,p_name text,p_street text,p_city text,p_state text,p_zip_code text,p_phone text,p_timezone text,p_active boolean default true)
returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
  perform 1 from public.merchants where id=p_merchant for update;
  perform private.require_catalog_admin(p_merchant);
  insert into public.stores(merchant_id,name,street,city,state,zip_code,phone,timezone,active)
  values(p_merchant,trim(p_name),trim(p_street),trim(p_city),trim(p_state),trim(p_zip_code),p_phone,p_timezone,p_active) returning id into sid;
  return sid;
end
$$;
create or replace function public.update_store(p_id uuid,p_version integer,p_name text,p_street text,p_city text,p_state text,p_zip_code text,p_phone text,p_timezone text,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare mid uuid;
begin
  select merchant_id into mid from public.stores where id=p_id;
  perform 1 from public.merchants where id=mid for update;
  perform private.require_catalog_admin(mid);
  update public.stores set name=trim(p_name),street=trim(p_street),city=trim(p_city),state=trim(p_state),zip_code=trim(p_zip_code),phone=p_phone,timezone=p_timezone,active=p_active where id=p_id and version=p_version;
  if not found then raise exception 'CONFLICT'; end if;
end
$$;
create or replace function public.create_product(p_store uuid,p_name text,p_description text,p_price integer,p_available boolean default true)
returns uuid language plpgsql security definer set search_path='' as $$
declare mid uuid; pid uuid;
begin
  select merchant_id into mid from public.stores where id=p_store;
  perform 1 from public.merchants where id=mid for update;
  perform private.require_store(p_store,array['admin','staff']::public.member_role[]);
  insert into public.products(merchant_id,store_id,name,description,price_minor,available) values(mid,p_store,trim(p_name),trim(p_description),p_price,p_available) returning id into pid;
  return pid;
end
$$;
create or replace function public.update_product(p_id uuid,p_version integer,p_name text,p_description text,p_price integer,p_available boolean)
returns void language plpgsql security definer set search_path='' as $$
declare p public.products;
begin
  select * into p from public.products where id=p_id;
  perform 1 from public.merchants where id=p.merchant_id for update;
  perform private.require_store(p.store_id,array['admin','staff']::public.member_role[]);
  update public.products set name=trim(p_name),description=trim(p_description),price_minor=p_price,available=p_available where id=p_id and version=p_version and archived_at is null;
  if not found then raise exception 'CONFLICT'; end if;
end
$$;
create or replace function public.archive_product(p_id uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare p public.products;
begin
  select * into p from public.products where id=p_id;
  perform 1 from public.merchants where id=p.merchant_id for update;
  perform private.require_store(p.store_id,array['admin','staff']::public.member_role[]);
  update public.products set archived_at=now(),available=false where id=p_id and version=p_version and archived_at is null;
  if not found then raise exception 'CONFLICT'; end if;
end
$$;
create or replace function public.set_product_availability(p_id uuid,p_version integer,p_available boolean) returns void language plpgsql security definer set search_path='' as $$
declare p public.products;
begin
  select * into p from public.products where id=p_id;
  perform 1 from public.merchants where id=p.merchant_id for update;
  perform private.require_store(p.store_id);
  update public.products set available=p_available where id=p_id and version=p_version and archived_at is null;
  if not found then raise exception 'CONFLICT'; end if;
end
$$;
create or replace function public.transition_order(p_id uuid,p_version integer,p_status public.order_status,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare o public.store_orders;
begin
  select * into o from public.store_orders where id=p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform private.require_store(o.store_id,array['admin','staff','operator']::public.member_role[],true);
  if p_status='cancelled' then raise exception 'FORBIDDEN'; end if;
  if o.status=p_status then return; end if;
  if o.version<>p_version then raise exception 'CONFLICT'; end if;
  if p_status='rejected' and (p_reason is null or length(trim(p_reason)) not between 2 and 500) then raise exception 'VALIDATION_ERROR'; end if;
  perform set_config('app.rejection_reason',coalesce(trim(p_reason),''),true);
  update public.store_orders set status=p_status where id=p_id;
end
$$;

create or replace function public.team_members(p_merchant uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_catalog_admin(p_merchant);
  return (select coalesce(jsonb_agg(x),'[]'::jsonb) from (
    select mm.id,mm.merchant_id,mm.user_id,mm.role,mm.active,u.email,
      coalesce((select jsonb_agg(a.store_id order by a.store_id) from public.merchant_store_assignments a where a.membership_id=mm.id and a.active),'[]'::jsonb) store_ids
    from public.merchant_memberships mm join auth.users u on u.id=mm.user_id where mm.merchant_id=p_merchant order by mm.role,u.email
  ) x);
end
$$;
create or replace function public.change_member(p_id uuid,p_role public.member_role,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
declare mm public.merchant_memberships;
begin
  select * into mm from public.merchant_memberships where id=p_id;
  perform 1 from public.merchants where id=mm.merchant_id for update;
  perform private.require_catalog_admin(mm.merchant_id);
  select * into mm from public.merchant_memberships where id=p_id for update;
  if mm.role='admin' and mm.active and (p_role<>'admin' or not p_active) and
    (select count(*) from public.merchant_memberships where merchant_id=mm.merchant_id and role='admin' and active)<=1 then raise exception 'LAST_ADMIN_REQUIRED'; end if;
  update public.merchant_memberships set role=p_role,active=p_active where id=p_id;
end
$$;
create function public.set_member_stores(p_id uuid,p_store_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare mm public.merchant_memberships;
begin
  select * into mm from public.merchant_memberships where id=p_id;
  perform 1 from public.merchants where id=mm.merchant_id for update;
  perform private.require_catalog_admin(mm.merchant_id);
  select * into mm from public.merchant_memberships where id=p_id for update;
  if mm.role='admin' then raise exception 'VALIDATION_ERROR'; end if;
  if p_store_ids is null or cardinality(p_store_ids)>100 or exists(
    select 1 from unnest(p_store_ids) sid where not exists(select 1 from public.stores s where s.id=sid and s.merchant_id=mm.merchant_id)
  ) then raise exception 'VALIDATION_ERROR'; end if;
  update public.merchant_store_assignments set active=false where membership_id=p_id and active and not(store_id=any(p_store_ids));
  insert into public.merchant_store_assignments(merchant_id,membership_id,store_id)
    select mm.merchant_id,mm.id,sid from (select distinct unnest(p_store_ids) sid) x
    on conflict(membership_id,store_id) do update set active=true;
end
$$;

-- New invitations can carry store assignments; their tenant FKs reject mixing merchants.
drop function public.create_invitation(uuid,text,public.member_role);
create function public.create_invitation(p_merchant uuid,p_email text,p_role public.member_role,p_store_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare token text=encode(extensions.gen_random_bytes(32),'hex'); iid uuid; merchant_state public.merchant_status;
begin
  select status into merchant_state from public.merchants where id=p_merchant for update;
  perform private.require_catalog_admin(p_merchant);
  if merchant_state='rejected' or (merchant_state='pending' and p_role<>'admin') then raise exception 'FORBIDDEN'; end if;
  if length(p_email)>254 or p_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' then raise exception 'VALIDATION_ERROR'; end if;
  if p_store_ids is null or cardinality(p_store_ids)>100 or (p_role='admin' and cardinality(p_store_ids)>0) or exists(
    select 1 from unnest(p_store_ids) sid where not exists(select 1 from public.stores s where s.id=sid and s.merchant_id=p_merchant)
  ) then raise exception 'VALIDATION_ERROR'; end if;
  update public.merchant_invitations set revoked_at=now() where merchant_id=p_merchant and email=lower(trim(p_email)) and accepted_at is null and revoked_at is null;
  insert into public.merchant_invitations(merchant_id,email,role,token_hash) values(p_merchant,lower(trim(p_email)),p_role,encode(extensions.digest(token,'sha256'),'hex')) returning id into iid;
  insert into public.merchant_invitation_stores(merchant_id,invitation_id,store_id) select p_merchant,iid,sid from (select distinct unnest(p_store_ids) sid)x;
  return jsonb_build_object('id',iid,'token',token);
end
$$;
create or replace function public.list_invitations(p_merchant uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_catalog_admin(p_merchant);
  return (select coalesce(jsonb_agg(x),'[]'::jsonb) from (
    select i.id,i.email,i.role,i.expires_at,i.accepted_at,i.revoked_at,i.delivery_state,
      coalesce((select jsonb_agg(s.store_id) from public.merchant_invitation_stores s where s.invitation_id=i.id),'[]'::jsonb) store_ids
    from public.merchant_invitations i where i.merchant_id=p_merchant order by i.created_at desc limit 100
  ) x);
end
$$;
create or replace function public.accept_invitation(p_token text) returns text language plpgsql security definer set search_path='' as $$
declare inv public.merchant_invitations; merchant_slug text; membership uuid;
begin
  if not private.is_verified() or not private.aal2() then raise exception 'FORBIDDEN'; end if;
  select * into inv from public.merchant_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if not found or inv.expires_at<now() or inv.accepted_at is not null or inv.revoked_at is not null or inv.email<>(select lower(email) from auth.users where id=auth.uid()) then raise exception 'FORBIDDEN'; end if;
  perform 1 from auth.users where id=auth.uid() for update;
  perform 1 from public.merchants where id=inv.merchant_id and status in ('active','pending') for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  if exists(select 1 from public.merchant_memberships where user_id=auth.uid()) then raise exception 'CONFLICT'; end if;
  insert into public.merchant_memberships(merchant_id,user_id,role) values(inv.merchant_id,auth.uid(),inv.role) returning id into membership;
  insert into public.merchant_store_assignments(merchant_id,membership_id,store_id) select inv.merchant_id,membership,s.store_id from public.merchant_invitation_stores s where s.invitation_id=inv.id;
  update public.merchant_invitations set accepted_at=now() where id=inv.id;
  select m.slug into merchant_slug from public.merchants m where id=inv.merchant_id;
  return merchant_slug;
end
$$;

create function public.merchant_applications() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_platform();
  return (select coalesce(jsonb_agg(x),'[]'::jsonb) from (
    select m.id,m.name,m.slug,m.status,m.rejection_reason,m.created_at,u.email applicant_email
    from public.merchants m join auth.users u on u.id=m.applicant_id
    where m.status in ('pending','rejected') order by m.created_at desc limit 100
  )x);
end
$$;
revoke all on function public.set_member_stores(uuid,uuid[]),public.create_invitation(uuid,text,public.member_role,uuid[]),public.merchant_applications() from public,anon,authenticated;
grant execute on function public.set_member_stores(uuid,uuid[]),public.create_invitation(uuid,text,public.member_role,uuid[]),public.merchant_applications() to authenticated;

-- No automatic production access is granted to existing workers. Administrators
-- assign their stores in Team after this migration. The local seed script assigns
-- demo workers explicitly.
