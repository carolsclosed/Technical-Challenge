-- A store page needs one store record and a page of products. The previous
-- shared offset paginated away the store record, forcing two catalogue calls.
create or replace function public.catalog(p_slug text default null,p_store uuid default null,p_search text default '',p_limit integer default 24,p_offset integer default 0)
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
  'stores',coalesce((select jsonb_agg(x) from (
    select s.id,s.name,s.street,s.city,s.state,s.zip_code,s.phone,s.timezone,m.name merchant_name,m.slug merchant_slug
    from public.stores s join public.merchants m on m.id=s.merchant_id
    where s.active and m.status='active' and (p_slug is null or m.slug=p_slug) and (p_store is null or s.id=p_store)
      and (p_store is not null or s.name ilike '%'||left(p_search,120)||'%' or m.name ilike '%'||left(p_search,120)||'%')
    order by s.name,s.id limit greatest(1,least(p_limit,100)) offset case when p_store is not null then 0 else greatest(0,p_offset) end
  )x),'[]'::jsonb),
  'products',coalesce((select jsonb_agg(x) from (
    select p.id,p.store_id,p.name,p.description,p.price_minor,p.available
    from public.products p join public.stores s on s.id=p.store_id join public.merchants m on m.id=s.merchant_id
    where p_store is not null and s.id=p_store and (p_slug is null or m.slug=p_slug) and s.active and m.status='active' and p.archived_at is null
    order by p.name,p.id limit greatest(1,least(p_limit,100)) offset greatest(0,p_offset)
  )x),'[]'::jsonb)
)
$$;
