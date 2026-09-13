-- Postgres UPDATE under RLS also needs a matching SELECT policy. Expose only
-- the invitation id so an authorized merchant admin can confirm that the
-- delivery-state update affected the invitation created in the same request.
-- Email addresses, token hashes and other invitation fields remain hidden.
grant select(id) on public.merchant_invitations to authenticated;

create policy invitation_delivery_read on public.merchant_invitations
  for select to authenticated
  using(
    private.is_platform()
    or private.member_ok(merchant_id,array['admin']::public.member_role[])
  );
