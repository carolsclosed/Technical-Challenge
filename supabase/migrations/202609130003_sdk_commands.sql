-- The application talks to PostgREST only through tables/views. Multi-row
-- operations are represented as inserts into narrowly typed command tables;
-- their triggers run in the INSERT transaction, so atomicity and row locks are
-- retained without exposing PostgreSQL functions as HTTP RPC endpoints.

-- Keep the email needed by authorized team/application screens in the RLS
-- protected business rows. This avoids SECURITY DEFINER read functions that
-- joined auth.users.
alter table public.merchant_memberships add column email text;
update public.merchant_memberships mm
set email=lower(u.email)
from auth.users u where u.id=mm.user_id;
alter table public.merchant_memberships alter column email set not null;
alter table public.merchant_memberships add constraint membership_email_normalized
  check(email=lower(trim(email)) and length(email)<=254);

alter table public.merchants add column applicant_email text;
update public.merchants m
set applicant_email=lower(u.email)
from auth.users u where u.id=m.applicant_id;
alter table public.merchants add constraint applicant_email_normalized
  check(applicant_email is null or (applicant_email=lower(trim(applicant_email)) and length(applicant_email)<=254));

create function private.fill_authorization_email() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  new.email=(select lower(email) from auth.users where id=new.user_id);
  if new.email is null then raise exception 'NOT_FOUND'; end if;
  return new;
end
$$;
create trigger fill_authorization_email before insert or update of user_id,email
  on public.merchant_memberships for each row execute function private.fill_authorization_email();

create function private.fill_applicant_email() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  new.applicant_email=case when new.applicant_id is null then null
    else (select lower(email) from auth.users where id=new.applicant_id) end;
  return new;
end
$$;
create trigger fill_applicant_email before insert or update of applicant_id,applicant_email
  on public.merchants for each row execute function private.fill_applicant_email();

-- Public catalog reads use an anonymous SDK client. These policies and column
-- grants expose only the documented public catalog fields.
grant select(id,name,slug,status) on public.merchants to anon;
grant select(id,merchant_id,name,street,city,state,zip_code,phone,timezone,active) on public.stores to anon;
grant select(id,merchant_id,store_id,name,description,price_minor,available,archived_at) on public.products to anon;

create policy public_merchants_read on public.merchants for select to anon
  using(status='active');
create policy public_stores_read on public.stores for select to anon
  using(active and exists(select 1 from public.merchants m where m.id=merchant_id and m.status='active'));
create policy public_products_read on public.products for select to anon
  using(archived_at is null and exists(
    select 1 from public.stores s join public.merchants m on m.id=s.merchant_id
    where s.id=store_id and s.active and m.status='active'
  ));

create view public.catalog_stores with (security_invoker=true,security_barrier=true) as
select s.id,s.name,s.street,s.city,s.state,s.zip_code,s.phone,s.timezone,
  m.name merchant_name,m.slug merchant_slug,
  lower(s.name||' '||m.name) search_text
from public.stores s join public.merchants m on m.id=s.merchant_id
where s.active and m.status='active';

create view public.catalog_products with (security_invoker=true,security_barrier=true) as
select p.id,p.store_id,p.name,p.description,p.price_minor,p.available,
  s.name store_name,m.slug merchant_slug
from public.products p
join public.stores s on s.id=p.store_id
join public.merchants m on m.id=s.merchant_id
where p.archived_at is null and s.active and m.status='active';

revoke all on public.catalog_stores,public.catalog_products from public,authenticated;
grant select on public.catalog_stores,public.catalog_products to anon;

-- AAL1 callers may learn only whether their own account already has a platform
-- or merchant role. The privileged records themselves remain protected by RLS
-- and require AAL2.
create view public.account_flags with (security_barrier=true) as
select auth.uid() user_id,
  exists(select 1 from public.platform_admins p where p.user_id=auth.uid() and p.active) platform,
  exists(select 1 from public.merchant_memberships mm where mm.user_id=auth.uid()) has_membership
where auth.uid() is not null;
revoke all on public.account_flags from public,anon;
grant select on public.account_flags to authenticated;

-- Authorized list screens now read the RLS-protected tables directly.
grant select(id,merchant_id,email,role,expires_at,accepted_at,revoked_at,delivery_state,created_at)
  on public.merchant_invitations to authenticated;
grant select(merchant_id,invitation_id,store_id) on public.merchant_invitation_stores to authenticated;
create policy invitation_admin_read on public.merchant_invitations for select to authenticated
  using(private.is_platform() or private.member_ok(merchant_id,array['admin']::public.member_role[]));
create policy invitation_store_admin_read on public.merchant_invitation_stores for select to authenticated
  using(private.is_platform() or private.member_ok(merchant_id,array['admin']::public.member_role[]));

-- The implementations used by command triggers live outside the exposed
-- schema and cannot be invoked through PostgREST.
alter function public.submit_merchant_application(text,text) set schema private;
alter function public.change_member(uuid,public.member_role,boolean) set schema private;
alter function public.set_member_stores(uuid,uuid[]) set schema private;
alter function public.invitation_details(text) set schema private;
alter function public.accept_invitation(text) set schema private;
alter function public.place_order(uuid,jsonb,jsonb) set schema private;
alter function public.transition_order(uuid,integer,public.order_status,text) set schema private;
alter function public.cancel_order(uuid,integer) set schema private;

create table public.merchant_application_commands(
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null default auth.uid() references auth.users(id),
  name text not null,
  slug text not null,
  merchant_id uuid,
  created_at timestamptz not null default now()
);
create table public.member_change_commands(
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null default auth.uid() references auth.users(id),
  membership_id uuid not null,
  role public.member_role not null,
  active boolean not null,
  created_at timestamptz not null default now()
);
create table public.member_store_commands(
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null default auth.uid() references auth.users(id),
  membership_id uuid not null,
  store_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create table public.invitation_creation_commands(
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null default auth.uid() references auth.users(id),
  merchant_id uuid not null,
  email text not null,
  role public.member_role not null,
  store_ids uuid[] not null default '{}',
  token_hash text,
  invitation_id uuid,
  merchant_name text,
  store_names text[] not null default '{}',
  created_at timestamptz not null default now()
);
create table public.invitation_preview_commands(
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null default auth.uid() references auth.users(id),
  token text,
  details jsonb,
  created_at timestamptz not null default now()
);
create table public.invitation_acceptance_commands(
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null default auth.uid() references auth.users(id),
  token text,
  merchant_slug text,
  created_at timestamptz not null default now()
);
create table public.order_submission_commands(
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null default auth.uid() references auth.users(id),
  idempotency_key uuid not null,
  delivery jsonb,
  items jsonb,
  group_id uuid,
  created_at timestamptz not null default now()
);
create table public.order_transition_commands(
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null default auth.uid() references auth.users(id),
  store_order_id uuid not null,
  expected_version integer not null,
  requested_status public.order_status not null,
  reason text,
  result_version integer,
  created_at timestamptz not null default now()
);

revoke all on public.merchant_application_commands,
  public.member_change_commands,
  public.member_store_commands,
  public.invitation_creation_commands,
  public.invitation_preview_commands,
  public.invitation_acceptance_commands,
  public.order_submission_commands,
  public.order_transition_commands
from public,anon,authenticated;

alter table public.merchant_application_commands enable row level security;
alter table public.member_change_commands enable row level security;
alter table public.member_store_commands enable row level security;
alter table public.invitation_creation_commands enable row level security;
alter table public.invitation_preview_commands enable row level security;
alter table public.invitation_acceptance_commands enable row level security;
alter table public.order_submission_commands enable row level security;
alter table public.order_transition_commands enable row level security;

create policy own_insert on public.merchant_application_commands for insert to authenticated
  with check(actor_id=auth.uid() and private.is_verified() and private.aal2());
create policy own_read on public.merchant_application_commands for select to authenticated using(actor_id=auth.uid());
create policy own_insert on public.member_change_commands for insert to authenticated
  with check(actor_id=auth.uid() and private.is_verified() and private.aal2());
create policy own_read on public.member_change_commands for select to authenticated using(actor_id=auth.uid());
create policy own_insert on public.member_store_commands for insert to authenticated
  with check(actor_id=auth.uid() and private.is_verified() and private.aal2());
create policy own_read on public.member_store_commands for select to authenticated using(actor_id=auth.uid());
create policy own_insert on public.invitation_creation_commands for insert to authenticated
  with check(actor_id=auth.uid() and private.is_verified() and private.aal2());
create policy own_read on public.invitation_creation_commands for select to authenticated using(actor_id=auth.uid());
create policy own_insert on public.invitation_preview_commands for insert to authenticated
  with check(actor_id=auth.uid() and private.is_verified());
create policy own_read on public.invitation_preview_commands for select to authenticated using(actor_id=auth.uid());
create policy own_insert on public.invitation_acceptance_commands for insert to authenticated
  with check(actor_id=auth.uid() and private.is_verified());
create policy own_read on public.invitation_acceptance_commands for select to authenticated using(actor_id=auth.uid());
create policy own_insert on public.order_submission_commands for insert to authenticated
  with check(actor_id=auth.uid() and private.customer_ok());
create policy own_read on public.order_submission_commands for select to authenticated using(actor_id=auth.uid());
create policy own_insert on public.order_transition_commands for insert to authenticated
  with check(actor_id=auth.uid() and private.is_verified());
create policy own_read on public.order_transition_commands for select to authenticated using(actor_id=auth.uid());

-- PostgREST needs SELECT on the command identity/input metadata when it builds
-- an INSERT ... RETURNING response under RLS. Grant those harmless columns,
-- while continuing to withhold every secret or private payload column. Each
-- table's own_read policy still limits rows to the authenticated actor.
grant insert(name,slug),select(id,actor_id,name,slug,merchant_id,created_at)
  on public.merchant_application_commands to authenticated;
grant insert(membership_id,role,active),select(id,actor_id,membership_id,role,active,created_at)
  on public.member_change_commands to authenticated;
grant insert(membership_id,store_ids),select(id,actor_id,membership_id,store_ids,created_at)
  on public.member_store_commands to authenticated;
grant insert(merchant_id,email,role,store_ids,token_hash),
  select(id,actor_id,merchant_id,email,role,store_ids,invitation_id,merchant_name,store_names,created_at)
  on public.invitation_creation_commands to authenticated;
grant insert(token),select(id,actor_id,details,created_at)
  on public.invitation_preview_commands to authenticated;
grant insert(token),select(id,actor_id,merchant_slug,created_at)
  on public.invitation_acceptance_commands to authenticated;
grant insert(idempotency_key,delivery,items),
  select(id,actor_id,idempotency_key,group_id,created_at)
  on public.order_submission_commands to authenticated;
grant insert(store_order_id,expected_version,requested_status,reason),
  select(id,actor_id,store_order_id,expected_version,requested_status,result_version,created_at)
  on public.order_transition_commands to authenticated;

create function private.run_merchant_application_command() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.actor_id is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;
  new.merchant_id=private.submit_merchant_application(new.name,new.slug);
  return new;
end
$$;
create trigger run_command before insert on public.merchant_application_commands
  for each row execute function private.run_merchant_application_command();

create function private.run_member_change_command() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.actor_id is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;
  perform private.change_member(new.membership_id,new.role,new.active);
  return new;
end
$$;
create trigger run_command before insert on public.member_change_commands
  for each row execute function private.run_member_change_command();

create function private.run_member_store_command() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.actor_id is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;
  perform private.set_member_stores(new.membership_id,new.store_ids);
  return new;
end
$$;
create trigger run_command before insert on public.member_store_commands
  for each row execute function private.run_member_store_command();

create function private.run_invitation_creation_command() returns trigger
language plpgsql security definer set search_path='' as $$
declare merchant_row public.merchants; invited_user uuid; existing_merchant uuid;
begin
  if new.actor_id is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;
  select * into merchant_row from public.merchants where id=new.merchant_id for update;
  perform private.require_catalog_admin(new.merchant_id);
  if merchant_row.status in ('rejected','suspended') or (merchant_row.status='pending' and new.role<>'admin') then raise exception 'FORBIDDEN'; end if;
  if length(new.email)>254 or new.email<>lower(trim(new.email)) or new.email !~ '^[^ @]+@[^ @]+\.[^ @]+$'
    or new.token_hash is null or new.token_hash !~ '^[a-f0-9]{64}$' then raise exception 'VALIDATION_ERROR'; end if;
  if cardinality(new.store_ids)>100 or (new.role='admin' and cardinality(new.store_ids)>0) or exists(
    select 1 from unnest(new.store_ids) sid where not exists(select 1 from public.stores s where s.id=sid and s.merchant_id=new.merchant_id)
  ) then raise exception 'VALIDATION_ERROR'; end if;
  select id into invited_user from auth.users where lower(email)=new.email;
  select merchant_id into existing_merchant from public.merchant_memberships where user_id=invited_user;
  if existing_merchant=new.merchant_id then raise exception 'INVITATION_ALREADY_MEMBER'; end if;
  if existing_merchant is not null or exists(select 1 from public.platform_admins where user_id=invited_user) then raise exception 'INVITATION_ACCOUNT_IN_USE'; end if;
  if (select count(*) from public.merchant_invitations where merchant_id=new.merchant_id and created_at>now()-interval '1 hour')>=60
    or exists(select 1 from public.merchant_invitations where merchant_id=new.merchant_id and email=new.email
      and created_at>now()-interval '1 minute' and delivery_state<>'failed' and revoked_at is null and accepted_at is null)
  then raise exception 'RATE_LIMITED'; end if;
  update public.merchant_invitations set revoked_at=now()
    where merchant_id=new.merchant_id and email=new.email and accepted_at is null and revoked_at is null;
  insert into public.merchant_invitations(merchant_id,email,role,token_hash)
    values(new.merchant_id,new.email,new.role,new.token_hash) returning id into new.invitation_id;
  insert into public.merchant_invitation_stores(merchant_id,invitation_id,store_id)
    select new.merchant_id,new.invitation_id,sid from (select distinct unnest(new.store_ids) sid)x;
  new.merchant_name=merchant_row.name;
  select coalesce(array_agg(s.name order by s.name,s.id),'{}') into new.store_names
    from public.stores s where s.id=any(new.store_ids);
  new.token_hash=null;
  return new;
end
$$;
create trigger run_command before insert on public.invitation_creation_commands
  for each row execute function private.run_invitation_creation_command();

create function private.run_invitation_preview_command() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.actor_id is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;
  new.details=private.invitation_details(new.token);
  new.token=null;
  return new;
end
$$;
create trigger run_command before insert on public.invitation_preview_commands
  for each row execute function private.run_invitation_preview_command();

create function private.run_invitation_acceptance_command() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.actor_id is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;
  new.merchant_slug=private.accept_invitation(new.token);
  new.token=null;
  return new;
end
$$;
create trigger run_command before insert on public.invitation_acceptance_commands
  for each row execute function private.run_invitation_acceptance_command();

create function private.run_order_submission_command() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.actor_id is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;
  new.group_id=private.place_order(new.idempotency_key,new.delivery,new.items);
  new.delivery=null;
  new.items=null;
  return new;
end
$$;
create trigger run_command before insert on public.order_submission_commands
  for each row execute function private.run_order_submission_command();

create function private.run_order_transition_command() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.actor_id is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;
  if new.requested_status='cancelled' then
    perform private.cancel_order(new.store_order_id,new.expected_version);
  else
    perform private.transition_order(new.store_order_id,new.expected_version,new.requested_status,new.reason);
  end if;
  select version into new.result_version from public.store_orders where id=new.store_order_id;
  new.reason=null;
  return new;
end
$$;
create trigger run_command before insert on public.order_transition_commands
  for each row execute function private.run_order_transition_command();

revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.customer_ok(),private.member_ok(uuid,public.member_role[],boolean),
  private.is_platform(),private.order_read(uuid),private.aal2(),private.is_verified(),
  private.store_ok(uuid,public.member_role[],boolean) to authenticated;

-- Remove obsolete exposed entry points. Historical migrations retain their
-- definitions; the final schema exposes no business function for SDK RPC use.
drop function public.catalog(text,uuid,text,integer,integer);
drop function public.cart_catalog(uuid[]);
drop function public.session_context();
drop function public.application_status();
drop function public.update_profile(text,text,text);
drop function public.resubmit_merchant_application(text);
drop function public.create_merchant(text,text);
drop function public.set_merchant_status(uuid,public.merchant_status,text);
drop function public.update_merchant_settings(uuid,text);
drop function public.create_invitation(uuid,text,public.member_role,uuid[]);
drop function public.list_invitations(uuid);
drop function public.revoke_invitation(uuid);
drop function public.create_store(uuid,text,text,text,text,text,text,text,boolean);
drop function public.update_store(uuid,integer,text,text,text,text,text,text,text,boolean);
drop function public.create_product(uuid,text,text,integer,boolean);
drop function public.update_product(uuid,integer,text,text,integer,boolean);
drop function public.archive_product(uuid,integer);
drop function public.set_product_availability(uuid,integer,boolean);
drop function public.public_merchant(text);
drop function public.team_members(uuid);
drop function public.merchant_applications();
drop function public.set_invitation_delivery(uuid,text);
