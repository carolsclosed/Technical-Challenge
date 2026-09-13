create function public.public_merchant(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('id',id,'name',name,'slug',slug) from public.merchants where slug=p_slug and status='active'$$;
create function public.team_members(p_merchant uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin perform private.require_member(p_merchant,array['admin']::public.member_role[]);return (select coalesce(jsonb_agg(x),'[]'::jsonb) from (select mm.id,mm.merchant_id,mm.user_id,mm.role,mm.active,u.email from public.merchant_memberships mm join auth.users u on u.id=mm.user_id where mm.merchant_id=p_merchant order by mm.role,u.email)x);end$$;
revoke all on function public.public_merchant(text),public.team_members(uuid) from public,anon,authenticated;
grant execute on function public.public_merchant(text) to anon,authenticated;
grant execute on function public.team_members(uuid) to authenticated;
-- Safeguard ownership even for maintenance code; ordinary users already have no direct writes.
create trigger immutable_owner before update on public.merchant_memberships for each row execute function private.immutable_owner();
