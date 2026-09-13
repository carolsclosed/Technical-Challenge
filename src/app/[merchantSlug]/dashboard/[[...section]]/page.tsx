import { notFound, redirect } from "next/navigation";
import { requireMerchant } from "@/lib/auth";
import { DashboardShell, Overview } from "@/components/dashboard-shell";
import {
  StoresManager,
  ProductsManager,
  InviteForm,
  Invitations,
  Team,
  EditForm,
  PageTitle,
  type Invitation,
  type TeamMember,
} from "@/components/manage";
import { MerchantOrders, OrderTracker } from "@/components/orders";
import { readTeamData } from "@/lib/team-data";

export default async function Page({
  params,
}: {
  params: Promise<{ merchantSlug: string; section?: string[] }>;
}) {
  const { merchantSlug, section = [] } = await params;
  const { db, member, platform } = await requireMerchant(merchantSlug);
  const [area, id, ...extra] = section;
  if (extra.length) notFound();
  const admin = member.role === "admin";
  const canManage = platform || member.status === "active";
  if (!area && !admin) redirect(`/${merchantSlug}/dashboard/orders`);
  if ((area === "team" || area === "settings") && (!admin || !canManage))
    notFound();
  if (platform && area === "orders") notFound();
  const { data: stores, error: storesError } = await db
    .from("stores")
    .select("*")
    .eq("merchant_id", member.merchant_id)
    .order("created_at", { ascending: false });
  if (storesError) throw Error("REQUEST_FAILED");
  let content;

  if (!area) {
    const [{ count: products }, orders] = await Promise.all([
      db
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("merchant_id", member.merchant_id)
        .is("archived_at", null),
      platform
        ? Promise.resolve({ count: null })
        : db
            .from("store_orders")
            .select("*", { count: "exact", head: true })
            .eq("merchant_id", member.merchant_id),
    ]);
    content = (
      <Overview
        counts={{
          stores: stores?.length ?? 0,
          products: products ?? 0,
          ...(platform ? {} : { orders: orders.count ?? 0 }),
        }}
      />
    );
  } else if (area === "stores" && !id) {
    content = (
      <StoresManager
        stores={stores ?? []}
        merchant={member.merchant_id}
        slug={merchantSlug}
        role={member.role}
        active={canManage}
      />
    );
  } else if (area === "stores" && id) {
    if (!canManage) notFound();
    const store = stores?.find((store) => store.id === id);
    if (!store) notFound();
    const { data, error } = await db
      .from("products")
      .select("*")
      .eq("merchant_id", member.merchant_id)
      .eq("store_id", id)
      .is("archived_at", null)
      .order("name");
    if (error) throw Error("REQUEST_FAILED");
    content = (
      <ProductsManager products={data ?? []} store={store} role={member.role} />
    );
  } else if (area === "orders" && !id) {
    const { data, error } = await db
      .from("store_orders")
      .select("*")
      .eq("merchant_id", member.merchant_id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw Error("REQUEST_FAILED");
    content = (
      <MerchantOrders
        initial={data ?? []}
        slug={merchantSlug}
        stores={stores ?? []}
      />
    );
  } else if (area === "orders" && id) {
    const { data } = await db
      .from("store_orders")
      .select("*,order_items(*),order_status_events(*)")
      .eq("merchant_id", member.merchant_id)
      .eq("id", id)
      .single();
    if (!data) notFound();
    content = (
      <>
        <PageTitle title="viewOrder" />
        <OrderTracker initial={[data]} merchant />
      </>
    );
  } else if (area === "team" && !id) {
    const team = await readTeamData(db, member.merchant_id);
    if (team.error) throw Error("REQUEST_FAILED");
    content = (
      <div className="stack">
        <PageTitle title="team" />
        <InviteForm
          merchant={member.merchant_id}
          stores={stores ?? []}
          initial={member.status === "pending"}
        />
        <Team
          members={team.members as TeamMember[]}
          stores={stores ?? []}
        />
        <Invitations items={team.invitations as Invitation[]} />
      </div>
    );
  } else if (area === "settings" && !id) {
    content = (
      <>
        <PageTitle title="settings" />
        <EditForm
          operation="merchantSettings"
          values={{ id: member.merchant_id, name: member.name }}
          fields={[{ name: "name", required: true, max: 120 }]}
        />
      </>
    );
  } else notFound();
  return (
    <DashboardShell
      slug={merchantSlug}
      name={member.name}
      role={member.role}
      status={member.status}
      platform={platform}
    >
      {content}
    </DashboardShell>
  );
}
