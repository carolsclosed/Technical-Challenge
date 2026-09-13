import { Cart } from "@/components/cart";
import { requireUser } from "@/lib/auth";
export default async function Page() {
  await requireUser("/checkout");
  return <Cart checkout />;
}
