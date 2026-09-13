"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";
import { money, nextStatus, terminal, type Status } from "@/lib/display";
import type { Database } from "@/lib/database.types";
import { useApp } from "./providers";
import { Action, EditForm } from "./manage";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
type Order = Database["public"]["Tables"]["store_orders"]["Row"];
type Item = Database["public"]["Tables"]["order_items"]["Row"];
type Event = Database["public"]["Tables"]["order_status_events"]["Row"];
export type OrderDetail = Order & {
  order_items: Item[];
  order_status_events: Event[];
};
export function OrderTracker({
  initial,
  group,
  merchant = false,
  slug,
  originalTotal,
}: {
  initial: OrderDetail[];
  group?: string;
  merchant?: boolean;
  slug?: string;
  originalTotal?: number;
}) {
  const t = useTranslations();
  const { locale } = useApp();
  const [orders, setOrders] = useState(initial);
  const [error, setError] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);
  const key = initial.map((o) => o.id).join(",");
  useEffect(() => setOrders(initial), [initial]);
  const refresh = useCallback(async () => {
    if (document.hidden) return;
    let q = browserClient()
      .from("store_orders")
      .select("*,order_items(*),order_status_events(*)");
    q = group ? q.eq("group_id", group) : q.in("id", key.split(","));
    const { data, error } = await q.order("created_at", { ascending: false });
    setError(!!error);
    if (data) {
      setOrders(data);
      setUpdated(new Date());
    }
  }, [group, key]);
  useEffect(() => {
    const timer = setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refresh]);
  return (
    <div className="stack">
      <div className="row">
        <p>
          {t("completed", {
            count: orders.filter((o) => o.status === "delivered").length,
            total: orders.length,
          })}
        </p>
        <div className="actions">
          <small>
            {updated &&
              `${t("updated")}: ${updated.toLocaleTimeString(locale)}`}
          </small>
          <Button size="sm" variant="outline" onClick={refresh}>
            {t("refresh")}
          </Button>
        </div>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {t("REQUEST_FAILED")}
        </div>
      )}
      {orders.map((o) => (
        <OrderCard key={o.id} order={o} merchant={merchant} slug={slug} />
      ))}
      {originalTotal !== undefined && (
        <div className="card card-body stack">
          <div className="row">
            <span>{t("originalTotal")}</span>
            <strong>{money(originalTotal, locale)}</strong>
          </div>
          <div className="row">
            <span>{t("cashTotal")}</span>
            <strong>
              {money(
                orders
                  .filter((o) => !["cancelled", "rejected"].includes(o.status))
                  .reduce((a, o) => a + o.subtotal_minor, 0),
                locale,
              )}
            </strong>
          </div>
          <p>{t("cash")}</p>
        </div>
      )}
    </div>
  );
}
function OrderCard({
  order: o,
  merchant,
  slug,
}: {
  order: OrderDetail;
  merchant: boolean;
  slug?: string;
}) {
  const t = useTranslations();
  const { locale } = useApp();
  const [rejectOpen, setRejectOpen] = useState(false);
  const path: Status[] = [
    "placed",
    "accepted",
    "preparing",
    "out_for_delivery",
    "delivered",
  ];
  const delivery = o.delivery as Record<string, string>;
  return (
    <article className="card order-card">
      <div className="row">
        <div>
          <small>#{o.reference}</small>
          <h2>{o.store_name}</h2>
        </div>
        <span className={"badge " + o.status}>{t(o.status)}</span>
      </div>
      {!["cancelled", "rejected"].includes(o.status) && (
        <div className="timeline">
          {path.map((s, i) => (
            <div
              key={s}
              className={
                "timeline-step " + (i <= path.indexOf(o.status) ? "done" : "")
              }
            >
              {t(s)}
            </div>
          ))}
        </div>
      )}
      <div className="order-items">
        {o.order_items.map((i) => (
          <div className="row" key={i.id}>
            <span>
              {i.quantity} × {i.product_name}
            </span>
            <strong>
              {money(
                i.line_total_minor ?? i.quantity * i.unit_price_minor,
                locale,
              )}
            </strong>
          </div>
        ))}
      </div>
      <div className="row">
        <strong>{t("subtotal")}</strong>
        <strong>{money(o.subtotal_minor, locale)}</strong>
      </div>
      <div className="address" style={{ marginTop: 20 }}>
        {delivery.name} · {delivery.phone}
        {"\n"}
        {delivery.street}
        {delivery.line2 ? `, ${delivery.line2}` : ""}
        {"\n"}
        {delivery.zip_code} {delivery.city}, {delivery.state} ·{" "}
        {delivery.country}
        {delivery.instructions ? `\n${delivery.instructions}` : ""}
      </div>
      <div className="stack" style={{ marginTop: 20 }}>
        {[...o.order_status_events]
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((e) => (
            <div key={e.id} className="row">
              <span>
                {t(e.new_status)}
                {e.reason ? ` — ${e.reason}` : ""}
              </span>
              <small>{new Date(e.created_at).toLocaleString(locale)}</small>
            </div>
          ))}
      </div>
      <div className="actions" style={{ marginTop: 20 }}>
        {merchant && nextStatus[o.status] && (
          <Action
            operation="transition"
            values={{
              id: o.id,
              version: o.version,
              status: nextStatus[o.status],
            }}
            label={nextStatus[o.status]!}
          />
        )}{" "}
        {merchant && o.status === "placed" && (
          <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">{t("reject")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>{t("reject")}</DialogTitle>
              <DialogDescription>#{o.reference}</DialogDescription>
              <EditForm
                operation="transition"
                values={{
                  id: o.id,
                  version: o.version,
                  status: "rejected",
                  reason: "",
                }}
                fields={[
                  {
                    name: "reason",
                    required: true,
                    type: "textarea",
                    max: 500,
                  },
                ]}
                label="confirm"
                onDone={() => setRejectOpen(false)}
              />
            </DialogContent>
          </Dialog>
        )}
        {!merchant && o.status === "placed" && (
          <Action
            operation="cancel"
            values={{ id: o.id, version: o.version }}
            label="cancel"
            confirm
          />
        )}
        {merchant && slug && (
          <Link className="muted" href={`/${slug}/dashboard/orders/${o.id}`}>
            {t("viewOrder")} →
          </Link>
        )}
      </div>
    </article>
  );
}
export function MerchantOrders({
  initial,
  slug,
  stores,
}: {
  initial: Order[];
  slug: string;
  stores: { id: string; name: string }[];
}) {
  const t = useTranslations();
  const { locale } = useApp();
  const router = useRouter();
  const [status, setStatus] = useState("open");
  const [store, setStore] = useState("all");
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) router.refresh();
    };
    const timer = setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);
  const filtered = initial.filter(
    (o) =>
      (store === "all" || o.store_id === store) &&
      (status === "all" ||
        (status === "open" && !terminal(o.status)) ||
        o.status === status),
  );
  return (
    <>
      <h1>{t("orders")}</h1>
      <div className="filters">
        <select
          aria-label={t("storeName")}
          value={store}
          onChange={(e) => setStore(e.target.value)}
        >
          <option value="all">{t("allStores")}</option>
          {stores.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label={t("status")}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {[
            "open",
            "all",
            "placed",
            "accepted",
            "preparing",
            "out_for_delivery",
            "delivered",
            "rejected",
            "cancelled",
          ].map((s) => (
            <option key={s} value={s}>
              {t(s === "open" ? "openOrders" : s)}
            </option>
          ))}
        </select>
        <Button variant="outline" onClick={() => router.refresh()}>
          {t("refresh")}
        </Button>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("orderReference")}</th>
              <th>{t("storeName")}</th>
              <th>{t("customer")}</th>
              <th>{t("subtotal")}</th>
              <th>{t("status")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id}>
                <td>
                  #{o.reference}
                  <br />
                  <small>{new Date(o.created_at).toLocaleString(locale)}</small>
                </td>
                <td>{o.store_name}</td>
                <td>{(o.delivery as Record<string, string>).name}</td>
                <td>{money(o.subtotal_minor, locale)}</td>
                <td>
                  <span className={"badge " + o.status}>{t(o.status)}</span>
                </td>
                <td>
                  <Link href={`/${slug}/dashboard/orders/${o.id}`}>
                    {t("view")} →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <div className="empty">{t("noOrders")}</div>}
      </div>
    </>
  );
}
export function History({
  groups,
}: {
  groups: (Database["public"]["Tables"]["order_groups"]["Row"] & {
    store_orders: { store_name: string; status: Status }[];
  })[];
}) {
  const t = useTranslations();
  const { locale } = useApp();
  return (
    <div className="container" style={{ maxWidth: 940 }}>
      <h1>{t("history")}</h1>
      <div className="stack">
        {groups.map((g) => (
          <Link className="card card-body" href={"/orders/" + g.id} key={g.id}>
            <div className="row">
              <h3>{new Date(g.created_at).toLocaleString(locale)}</h3>
              <strong>{money(g.submitted_total_minor, locale)}</strong>
            </div>
            <div className="stack">
              {g.store_orders.map((o, i) => (
                <div className="row" key={i}>
                  <span>{o.store_name}</span>
                  <span className={"badge " + o.status}>{t(o.status)}</span>
                </div>
              ))}
            </div>
          </Link>
        ))}
      </div>
      {!groups.length && <div className="empty">{t("noOrders")}</div>}
    </div>
  );
}
