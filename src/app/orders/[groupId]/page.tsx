import { requireUser } from "@/lib/auth";
import { OrderTracker } from "@/components/orders";
import { notFound } from "next/navigation";
import { PageTitle } from "@/components/manage";
export default async function Page({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const { db, user } = await requireUser("/orders/" + groupId);
  const { data: group } = await db
    .from("order_groups")
    .select("*")
    .eq("id", groupId)
    .eq("customer_id", user.id)
    .single();
  if (!group) notFound();
  const { data, error } = await db
    .from("store_orders")
    .select("*,order_items(*),order_status_events(*)")
    .eq("group_id", groupId)
    .order("created_at");
  if (error) throw Error("REQUEST_FAILED");
  return (
    <div className="container" style={{ maxWidth: 940 }}>
      <PageTitle title="tracking" />
      <OrderTracker
        initial={data ?? []}
        group={groupId}
        originalTotal={group.submitted_total_minor}
      />
    </div>
  );
}
