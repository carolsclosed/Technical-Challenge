create function private.validate_delivery(d jsonb) returns boolean language sql immutable set search_path='' as $$select jsonb_typeof(d)='object' and coalesce(length(trim(d->>'name')) between 2 and 120,false) and coalesce((d->>'phone') ~ '^\+[1-9][0-9]{6,14}$',false) and coalesce(d->>'country' in ('PT','US'),false) and coalesce(length(trim(d->>'street')) between 2 and 200,false) and coalesce(length(d->>'line2')<=200,true) and coalesce(length(trim(d->>'city')) between 1 and 100,false) and coalesce(length(trim(d->>'state')) between 1 and 100,false) and coalesce(length(d->>'zip_code') between 1 and 20 and (d->>'zip_code') ~ '^[[:alnum:] -]+$',false) and coalesce(length(d->>'instructions')<=500,true) and not exists(select 1 from jsonb_object_keys(d) k where k not in ('name','phone','country','street','line2','city','state','zip_code','instructions'))$$;
alter table public.store_orders add constraint valid_delivery check(private.validate_delivery(delivery));
create function public.place_order(p_key uuid,p_delivery jsonb,p_items jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare normalized jsonb; fingerprint text; existing public.order_groups; gid uuid; oid uuid; row_item record; store_row record; total bigint; invalid_ids jsonb;
begin
 if not private.customer_ok() then raise exception 'FORBIDDEN'; end if;
 if p_key is null or not private.validate_delivery(p_delivery) or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'VALIDATION_ERROR'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x)<>'object' or not (x ?& array['product_id','quantity','unit_price_minor']) or exists(select 1 from jsonb_object_keys(x) k where k not in ('product_id','quantity','unit_price_minor')) or (x->>'quantity') !~ '^[0-9]+$' or (x->>'unit_price_minor') !~ '^[0-9]+$' or (x->>'quantity')::numeric not between 1 and 99 or (x->>'unit_price_minor')::numeric not between 1 and 99999999) then raise exception 'VALIDATION_ERROR'; end if;
 if (select count(distinct (x->>'product_id')::uuid) from jsonb_array_elements(p_items)x)<>jsonb_array_length(p_items) then raise exception 'VALIDATION_ERROR'; end if;
 select jsonb_agg(jsonb_build_object('product_id',(x->>'product_id')::uuid,'quantity',(x->>'quantity')::integer,'unit_price_minor',(x->>'unit_price_minor')::integer) order by (x->>'product_id')::uuid) into normalized from jsonb_array_elements(p_items)x;
 fingerprint=encode(extensions.digest(jsonb_build_object('delivery',p_delivery,'items',normalized)::text,'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||p_key::text,0));
 select * into existing from public.order_groups where customer_id=auth.uid() and idempotency_key=p_key;
 if found then if existing.request_hash<>fingerprint then raise exception 'CONFLICT'; end if; return existing.id; end if;
 perform m.id from public.merchants m where m.id in (select p.merchant_id from public.products p join jsonb_array_elements(normalized)x on p.id=(x->>'product_id')::uuid) order by m.id for update;
 perform s.id from public.stores s where s.id in (select p.store_id from public.products p join jsonb_array_elements(normalized)x on p.id=(x->>'product_id')::uuid) order by s.id for update;
 perform p.id from public.products p join jsonb_array_elements(normalized)x on p.id=(x->>'product_id')::uuid order by p.id for update of p;
 select jsonb_agg(x->>'product_id') into invalid_ids from jsonb_array_elements(normalized)x left join public.products p on p.id=(x->>'product_id')::uuid left join public.stores s on s.id=p.store_id left join public.merchants m on m.id=p.merchant_id where p.id is null or not p.available or p.archived_at is not null or not s.active or m.status<>'active' or p.price_minor<>(x->>'unit_price_minor')::integer;
 if invalid_ids is not null then raise exception 'CART_CHANGED' using detail=invalid_ids::text; end if;
 if (select count(distinct p.store_id) from public.products p join jsonb_array_elements(normalized)x on p.id=(x->>'product_id')::uuid)>10 then raise exception 'VALIDATION_ERROR'; end if;
 select sum(p.price_minor::bigint*(x->>'quantity')::integer) into total from public.products p join jsonb_array_elements(normalized)x on p.id=(x->>'product_id')::uuid;
 insert into public.order_groups(customer_id,idempotency_key,request_hash,submitted_total_minor) values(auth.uid(),p_key,fingerprint,total) returning id into gid;
 for store_row in select s.id,s.merchant_id,s.name,sum(p.price_minor::bigint*(x->>'quantity')::integer) subtotal from public.stores s join public.products p on p.store_id=s.id join jsonb_array_elements(normalized)x on p.id=(x->>'product_id')::uuid group by s.id order by s.id loop
  insert into public.store_orders(group_id,merchant_id,store_id,customer_id,store_name,subtotal_minor,delivery) values(gid,store_row.merchant_id,store_row.id,auth.uid(),store_row.name,store_row.subtotal,p_delivery) returning id into oid;
  insert into public.order_items(store_order_id,merchant_id,store_id,product_id,product_name,unit_price_minor,quantity) select oid,p.merchant_id,p.store_id,p.id,p.name,p.price_minor,(x->>'quantity')::integer from public.products p join jsonb_array_elements(normalized)x on p.id=(x->>'product_id')::uuid where p.store_id=store_row.id;
 end loop;
 return gid;
end$$;
create function private.order_guard() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='UPDATE' and (to_jsonb(new)-array['status','version','updated_at']) is distinct from (to_jsonb(old)-array['status','version','updated_at']) then raise exception 'FORBIDDEN'; end if;
 if tg_op='UPDATE' and new.status<>old.status and not ((old.status='placed' and new.status in ('accepted','rejected','cancelled')) or (old.status='accepted' and new.status='preparing') or (old.status='preparing' and new.status='out_for_delivery') or (old.status='out_for_delivery' and new.status='delivered')) then raise exception 'CONFLICT'; end if;
 return new; end$$;
create trigger order_guard before update on public.store_orders for each row execute function private.order_guard();
create function private.status_event() returns trigger language plpgsql security definer set search_path='' as $$begin if tg_op='INSERT' or new.status<>old.status then insert into public.order_status_events(store_order_id,previous_status,new_status,actor_id,reason) values(new.id,case when tg_op='UPDATE' then old.status else null end,new.status,auth.uid(),case when new.status='rejected' then nullif(current_setting('app.rejection_reason',true),'') else null end); end if; return new; end$$;
create trigger status_event after insert or update on public.store_orders for each row execute function private.status_event();
create function private.no_mutation() returns trigger language plpgsql set search_path='' as $$begin raise exception 'FORBIDDEN'; end$$;
create trigger immutable before update or delete on public.order_groups for each row execute function private.no_mutation();
create trigger immutable before update or delete on public.order_items for each row execute function private.no_mutation();
create trigger immutable before update or delete on public.order_status_events for each row execute function private.no_mutation();
create trigger immutable before update or delete on public.audit_events for each row execute function private.no_mutation();
create function public.transition_order(p_id uuid,p_version integer,p_status public.order_status,p_reason text default null) returns void language plpgsql security definer set search_path='' as $$declare o public.store_orders; begin select * into o from public.store_orders where id=p_id for update; if not found then raise exception 'NOT_FOUND'; end if; perform private.require_member(o.merchant_id,array['admin','staff','operator']::public.member_role[],true); if p_status='cancelled' then raise exception 'FORBIDDEN'; end if; if o.status=p_status then return; end if; if o.version<>p_version then raise exception 'CONFLICT'; end if; if p_status='rejected' and (p_reason is null or length(trim(p_reason)) not between 2 and 500) then raise exception 'VALIDATION_ERROR'; end if; perform set_config('app.rejection_reason',coalesce(trim(p_reason),''),true); update public.store_orders set status=p_status where id=p_id; end$$;
create function public.cancel_order(p_id uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$declare o public.store_orders; begin if not private.customer_ok() then raise exception 'FORBIDDEN'; end if; select * into o from public.store_orders where id=p_id and customer_id=auth.uid() for update; if not found then raise exception 'NOT_FOUND'; end if; if o.status='cancelled' then return; end if; if o.status<>'placed' or o.version<>p_version then raise exception 'CONFLICT'; end if; update public.store_orders set status='cancelled' where id=p_id; end$$;
-- No implicit EXECUTE grants: helpers are inaccessible except policy predicates.
revoke execute on all functions in schema public from public,anon,authenticated;
revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.customer_ok(),private.member_ok(uuid,public.member_role[],boolean),private.is_platform(),private.order_read(uuid),private.aal2(),private.is_verified() to authenticated;
grant execute on function public.catalog(text,uuid,text,integer,integer),public.cart_catalog(uuid[]) to anon,authenticated;
grant execute on all functions in schema public to authenticated;
-- Service role only for invitation email delivery bookkeeping; no application user access.
grant all on public.merchant_invitations to service_role;
