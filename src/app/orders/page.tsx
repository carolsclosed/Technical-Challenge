import { requireUser } from "@/lib/auth";
import { History } from "@/components/orders";
export default async function Page() {
  const { db, user } = await requireUser("/orders");
  const { data, error } = await db
    .from("order_groups")
    .select("*,store_orders(store_name,status)")
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw Error("REQUEST_FAILED");
  return <History groups={data ?? []} />;
}
