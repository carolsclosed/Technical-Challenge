"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingBag, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useApp } from "./providers";
import { readCartProducts } from "@/lib/catalog-data";
import {
  deliverySchema,
  money,
  type CartProduct,
  type Delivery,
} from "@/lib/domain";
import { Button } from "./ui/button";
import { submitOrder } from "@/app/actions/business";
export function Cart({ checkout = false }: { checkout?: boolean }) {
  const { cartEpoch } = useApp();
  // Identity changes destroy delivery form values and pending submissions.
  return <CartContents key={cartEpoch} checkout={checkout} />;
}
function CartContents({ checkout = false }: { checkout?: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const { lines, setLines, ready, locale } = useApp();
  const [products, setProducts] = useState<CartProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lastPrices = useRef<Map<string, number>>(new Map());
  const [pending, setPending] = useState<
    Parameters<typeof submitOrder>[0] | null
  >(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Delivery>({
    resolver: zodResolver(deliverySchema),
    defaultValues: { country: "PT", line2: "", instructions: "" },
  });
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const ids = lines
    .map((l) => l.product_id)
    .sort()
    .join(",");
  const load = useCallback(async () => {
    if (!ready) return;
    setError("");
    if (!ids) {
      setProducts([]);
      setLoading(false);
      return;
    }
    const { data, error: err } = await readCartProducts(ids.split(","));
    if (!active.current) return;
    if (err) {
      setError("REQUEST_FAILED");
      setLoading(false);
      return;
    }
    const list = data as CartProduct[];
    if (
      list.some(
        (p) =>
          lastPrices.current.has(p.id) &&
          lastPrices.current.get(p.id) !== p.price_minor,
      )
    )
      setNotice("priceChanged");
    list.forEach((p) => lastPrices.current.set(p.id, p.price_minor));
    setProducts(list);
    setLoading(false);
  }, [ids, ready]);
  useEffect(() => {
    void load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);
  const resolved = lines.map((l) => ({
    ...l,
    p: products.find((p) => p.id === l.product_id),
  }));
  const invalid = resolved.some((x) => !x.p || !x.p.available);
  const groups = Map.groupBy(resolved, (x) => x.p?.store_id ?? "unavailable");
  const total = resolved.reduce(
    (s, x) => s + (x.p?.price_minor ?? 0) * x.quantity,
    0,
  );
  async function send(payload: unknown) {
    if (!active.current) return;
    setBusy(true);
    setError("");
    try {
      const result = await submitOrder(payload);
      if (!active.current) return;
      if (result.error) {
        setError(result.error);
        setPending(null);
        if (result.error === "CART_CHANGED") await load();
        return;
      }
      const submitted = (
        payload as { items: { product_id: string; quantity: number }[] }
      ).items;
      const accepted = setLines((old) =>
        old.flatMap((l) => {
          const item = submitted.find((i) => i.product_id === l.product_id);
          const quantity = l.quantity - (item?.quantity ?? 0);
          return quantity > 0 ? [{ ...l, quantity }] : [];
        }),
      );
      if (!accepted) return;
      setPending(null);
      router.push("/orders/" + result.id);
    } catch {
      setError("REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }
  const onSubmit = (delivery: Delivery) => {
    if (!active.current || invalid || !lines.length) return;
    const payload = {
      key: crypto.randomUUID(),
      delivery,
      items: resolved.map((x) => ({
        product_id: x.product_id,
        quantity: x.quantity,
        unit_price_minor: x.p!.price_minor,
      })),
    };
    setPending(payload);
    void send(payload);
  };
  if (!ready || loading)
    return (
      <div className="container">
        <div className="skeleton" />
      </div>
    );
  if (!lines.length)
    return (
      <div className="container empty">
        <ShoppingBag size={40} />
        <h1>{t("cart")}</h1>
        <p>{t("emptyCart")}</p>
        <Button asChild>
          <Link href="/">{t("browse")}</Link>
        </Button>
      </div>
    );
  const review = (
    <div className="stack">
      {[...groups.entries()].map(([sid, items]) => (
        <section className="card card-body" key={sid}>
          <div className="row">
            <h3>{items[0]?.p?.store_name ?? t("unavailable")}</h3>
            {!checkout && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={t("removeStore")}
                onClick={() =>
                  setLines((old) =>
                    old.filter(
                      (l) => !items.some((i) => i.product_id === l.product_id),
                    ),
                  )
                }
              >
                <Trash2 size={16} />
              </Button>
            )}
          </div>
          {items.map((x) => (
            <div className="cart-item" key={x.product_id}>
              <div>
                <strong>{x.p?.name ?? t("unavailable")}</strong>
                {!x.p?.available && (
                  <div className="field-error">{t("unavailable")}</div>
                )}
              </div>
              <div className="actions">
                {checkout ? (
                  <span>×{x.quantity}</span>
                ) : (
                  <input
                    className="quantity"
                    aria-label={t("quantity")}
                    type="number"
                    min={1}
                    max={99}
                    value={x.quantity}
                    onChange={(e) =>
                      setLines((old) =>
                        old.map((l) =>
                          l.product_id === x.product_id
                            ? {
                                ...l,
                                quantity: Math.max(
                                  1,
                                  Math.min(99, Number(e.target.value) || 1),
                                ),
                              }
                            : l,
                        ),
                      )
                    }
                  />
                )}
                <span className="price">
                  {money((x.p?.price_minor ?? 0) * x.quantity, locale)}
                </span>
                {!checkout && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t("remove")}
                    onClick={() =>
                      setLines((old) =>
                        old.filter((l) => l.product_id !== x.product_id),
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </Button>
                )}
              </div>
            </div>
          ))}
          <div className="row" style={{ marginTop: 16 }}>
            <span>{t("subtotal")}</span>
            <strong>
              {money(
                items.reduce(
                  (a, x) => a + (x.p?.price_minor ?? 0) * x.quantity,
                  0,
                ),
                locale,
              )}
            </strong>
          </div>
        </section>
      ))}
    </div>
  );
  return (
    <div className="container">
      <h1>{t(checkout ? "checkout" : "cart")}</h1>
      {notice && <p className="notice">{t(notice)}</p>}
      {invalid && <p className="notice error">{t("cartChanged")}</p>}
      {error && (
        <div className="notice error" role="alert">
          {t(error)}{" "}
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => (pending ? void send(pending) : void load())}
          >
            {t(pending ? "retrySubmission" : "retry")}
          </Button>
        </div>
      )}
      <div className="checkout-layout">
        <div>
          {checkout ? (
            <form
              id="delivery-form"
              onSubmit={(event) => void handleSubmit(onSubmit)(event)}
              className="card card-body stack"
            >
              <h2>{t("delivery")}</h2>
              <div className="form-grid">
                {(
                  [
                    "name",
                    "phone",
                    "street",
                    "line2",
                    "city",
                    "state",
                    "zip_code",
                    "instructions",
                  ] as const
                ).map((key) => (
                  <div
                    key={key}
                    className={
                      ["street", "line2", "instructions"].includes(key)
                        ? "span-2"
                        : ""
                    }
                  >
                    <label htmlFor={key}>{t(key)}</label>
                    <input
                      id={key}
                      {...register(key)}
                      autoComplete={
                        key === "name"
                          ? "name"
                          : key === "phone"
                            ? "tel"
                            : key === "street"
                              ? "address-line1"
                              : key === "line2"
                                ? "address-line2"
                                : key === "city"
                                  ? "address-level2"
                                  : key === "state"
                                    ? "address-level1"
                                    : key === "zip_code"
                                      ? "postal-code"
                                      : "off"
                      }
                      aria-invalid={!!errors[key]}
                      placeholder={key === "phone" ? "+351…" : undefined}
                    />
                    {errors[key] && (
                      <div className="field-error">{t("VALIDATION_ERROR")}</div>
                    )}
                  </div>
                ))}
                <div>
                  <label htmlFor="country">{t("country")}</label>
                  <select id="country" {...register("country")}>
                    <option value="PT">{t("Portugal")}</option>
                    <option value="US">{t("US")}</option>
                  </select>
                </div>
              </div>
              <Link href="/cart">← {t("cart")}</Link>
            </form>
          ) : (
            review
          )}
        </div>
        <aside className="summary stack">
          {checkout && review}
          <section className="card card-body">
            <div className="row">
              <h2>{t("total")}</h2>
              <h2>{money(total, locale)}</h2>
            </div>
            <p className="notice">{t("cash")}</p>
            {checkout ? (
              <Button
                type="submit"
                form="delivery-form"
                disabled={busy || invalid || !!pending}
                className="w-full"
              >
                {t(busy ? "loading" : "placeOrder")}
              </Button>
            ) : (
              <Button asChild className="w-full">
                <Link
                  href={invalid ? "/cart" : "/checkout"}
                  aria-disabled={invalid}
                >
                  {t("checkout")} →
                </Link>
              </Button>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
