"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Store as StoreIcon,
  ArrowUpRight,
  ShoppingBag,
  Leaf,
  MapPin,
  Plus,
  LoaderCircle,
  Check,
} from "lucide-react";
import { Button } from "./ui/button";
import { useApp } from "./providers";
import { readCartProducts } from "@/lib/catalog-data";
import type { Catalog, CartProduct, Product } from "@/lib/domain";
import { money } from "@/lib/display";

function StoreSearch({ query }: { query: string }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(query);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== input.current) setValue(query);
  }, [query]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function search(text: string) {
    clearTimeout(timer.current);
    const params = new URLSearchParams();
    if (text.trim()) params.set("q", text.trim());
    startTransition(() =>
      router.replace(`${pathname}${params.size ? `?${params}` : ""}`, {
        scroll: false,
      }),
    );
  }

  return (
    <form
      className="search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        search(value);
      }}
    >
      <Search size={20} />
      <input
        ref={input}
        name="q"
        value={value}
        maxLength={120}
        placeholder={t("search")}
        aria-label={t("search")}
        onChange={(event) => {
          const text = event.target.value;
          setValue(text);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => search(text), 250);
        }}
      />
      <span role="status" aria-live="polite" className="search-status">
        {pending ? (
          <>
            <LoaderCircle size={18} className="animate-spin" />
            <span className="sr-only">{t("loading")}</span>
          </>
        ) : null}
      </span>
    </form>
  );
}

export function CatalogView({
  catalog,
  title,
  storePage = false,
  query = "",
  page = 0,
}: {
  catalog: Catalog;
  title?: string;
  storePage?: boolean;
  query?: string;
  page?: number;
}) {
  const t = useTranslations();
  return (
    <div className="container">
      {!storePage ? (
        <>
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">{title ?? t("allStores")}</div>
              <h1>{title ?? t("marketTitle")}</h1>
              <p>{t("marketSubtitle")}</p>
              <StoreSearch query={query} />
              <div className="hero-note">
                <Leaf size={18} />
                <span>{t("cash")}</span>
              </div>
            </div>
            <div className="hero-aside" aria-hidden="true">
              <FoodIllustration />
            </div>
          </section>
          <div className="section-heading">
            <h2>{t("stores")}</h2>
          </div>
          <div className="grid store-grid">
            {catalog.stores.map((store) => (
              <Link
                className="card store-card"
                key={store.id}
                href={`/${store.merchant_slug}/stores/${store.id}`}
              >
                <div className="store-cover" aria-hidden="true">
                  <StoreIcon />
                </div>
                <div className="card-body">
                  <small>{store.merchant_name}</small>
                  <div className="row">
                    <h3>{store.name}</h3>
                    <ArrowUpRight size={20} aria-hidden="true" />
                  </div>
                  <div className="store-location muted">
                    <MapPin size={14} aria-hidden="true" />
                    <span>
                      {store.city} · {store.street}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {!catalog.stores.length && (
            <div className="empty">
              <StoreIcon />
              <h2>{t("empty")}</h2>
              <p>{t("emptyStores")}</p>
            </div>
          )}
        </>
      ) : (
        <>
          <Link className="muted" href={`/${catalog.stores[0]?.merchant_slug}`}>
            ← {catalog.stores[0]?.merchant_name}
          </Link>
          <div className="section-heading store-heading">
            <div>
              <div className="eyebrow">{t("products")}</div>
              <h1>{catalog.stores[0]?.name}</h1>
              <p>
                {catalog.stores[0]?.street} · {catalog.stores[0]?.city} ·{" "}
                {catalog.stores[0]?.phone}
              </p>
            </div>
            <span className="badge">{t("cash")}</span>
          </div>
          <ProductGrid products={catalog.products} />
        </>
      )}
      {(storePage ? catalog.products : catalog.stores).length === 24 && (
        <div className="actions" style={{ marginTop: 24 }}>
          <Button asChild variant="outline">
            <Link href={`?q=${encodeURIComponent(query)}&page=${page + 1}`}>
              {t("more")}
            </Link>
          </Button>
        </div>
      )}
      {page > 0 && (
        <Link href="?page=0" className="muted">
          ← {t("back")}
        </Link>
      )}
    </div>
  );
}

// Decorative local vector artwork: no remote images, ratings or delivery claims.
function FoodIllustration() {
  return (
    <svg
      className="hero-food"
      viewBox="0 0 380 340"
      fill="none"
      focusable="false"
    >
      <ellipse cx="195" cy="280" rx="132" ry="27" fill="#173F2E" opacity=".1" />
      <path
        d="M42 170c-25-62 10-120 74-118 52 2 51-31 111-18 74 16 119 79 108 142-11 68-66 105-142 101C111 273 72 247 42 170Z"
        fill="#F5BA38"
      />
      <g transform="rotate(-12 194 170)">
        <circle cx="194" cy="168" r="117" fill="#FFFEF8" />
        <circle cx="194" cy="168" r="96" stroke="#F0EAD6" strokeWidth="12" />
        <circle cx="194" cy="168" r="82" fill="#E7DCC3" />
        <path
          d="M125 130c8-25 38-36 58-20 12 9 19 34 9 48-15 20-70 17-67-28Z"
          fill="#249266"
        />
        <path
          d="M124 177c-10-22 16-49 35-43 25 8 31 29 16 53-12 19-42 17-51-10Z"
          fill="#72B55C"
        />
        <path
          d="M177 199c-12-21 5-41 26-49 24-9 55 13 47 36-8 24-57 34-73 13Z"
          fill="#E9B460"
        />
        <path
          d="M182 183l47-19m-40 31 47-19m-36 29 40-17"
          stroke="#B97939"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle cx="224" cy="128" r="23" fill="#EB6549" />
        <circle cx="224" cy="128" r="15" stroke="#FFAD74" strokeWidth="3" />
        <path d="m224 115 1 26m-14-14 27 2" stroke="#FFAD74" strokeWidth="3" />
        <circle cx="150" cy="204" r="17" fill="#E9694E" />
        <circle cx="150" cy="204" r="9" stroke="#FFAD74" strokeWidth="3" />
        <path d="M236 205c-6-21 4-40 24-44 6 22-2 37-24 44Z" fill="#248353" />
        <path
          d="m237 198 17-27"
          stroke="#A7CD7A"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M162 119c4-4 9-5 13-1m-48 47c2-5 6-6 10-6m36 33 4-7"
          stroke="#E3F0C7"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
      <path d="M46 86c-10-33 8-59 42-61C84 62 72 80 46 86Z" fill="#19835A" />
      <path
        d="M48 80 76 39"
        stroke="#A2C981"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M311 249a30 30 0 0 1 44 34l-28-10-16-24Z"
        fill="#FFFEF8"
        stroke="#F3BA3A"
        strokeWidth="5"
      />
      <path d="m327 273 7-20m-7 20 23-5" stroke="#F3BA3A" strokeWidth="3" />
      <path
        d="m301 59 6 13m14-6-11 6"
        stroke="#173F2E"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="72" cy="281" r="6" fill="#19835A" />
    </svg>
  );
}

function ProductGrid({ products }: { products: Product[] }) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const filtered = products.filter((product) =>
    product.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <>
      <div className="search" style={{ marginBottom: 24 }}>
        <Search size={20} />
        <input
          aria-label={t("products")}
          placeholder={t("products")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="grid menu-grid">
        {filtered.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {!filtered.length && (
        <div className="empty">
          <ShoppingBag />
          <p>{t("empty")}</p>
        </div>
      )}
    </>
  );
}

export function ProductCard({ product }: { product: Product }) {
  const t = useTranslations();
  const { lines, setLines, locale, ready } = useApp();
  const [state, setState] = useState<"idle" | "adding" | "added">("idle");
  const [error, setError] = useState("");
  const [outOfStock, setOutOfStock] = useState(!product.available);
  const locked = useRef(false);
  const reset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(reset.current), []);
  useEffect(() => setOutOfStock(!product.available), [product.available]);

  async function add() {
    if (locked.current || !ready || outOfStock) return;
    locked.current = true;
    setState("adding");
    setError("");
    try {
      const existing = lines.find((line) => line.product_id === product.id);
      if ((existing?.quantity ?? 0) >= 99 || (!existing && lines.length >= 100))
        throw Error("cartLimit");
      const { data, error: catalogError } = await readCartProducts([product.id]);
      if (catalogError) throw Error("REQUEST_FAILED");
      const current = (data as unknown as CartProduct[]).find(
        (item) => item.id === product.id,
      );
      if (!current?.available) {
        setOutOfStock(true);
        throw Error("outOfStock");
      }
      const accepted = setLines((old) => {
        const item = old.find((line) => line.product_id === product.id);
        if (item)
          return old.map((line) =>
            line.product_id === product.id
              ? { ...line, quantity: Math.min(99, line.quantity + 1) }
              : line,
          );
        return old.length >= 100
          ? old
          : [...old, { product_id: product.id, quantity: 1 }];
      });
      if (!accepted) {
        locked.current = false;
        setState("idle");
        return;
      }
      setState("added");
      // Keep acknowledgement disabled until a second Add is deliberate.
      reset.current = setTimeout(() => {
        locked.current = false;
        setState("idle");
      }, 900);
    } catch (cause) {
      setError(
        cause instanceof Error &&
          ["cartLimit", "outOfStock"].includes(cause.message)
          ? cause.message
          : "REQUEST_FAILED",
      );
      locked.current = false;
      setState("idle");
    }
  }

  return (
    <article className="card product-card">
      <div className="row">
        <h3>{product.name}</h3>
        <span className={`badge${outOfStock ? " out-of-stock" : ""}`}>
          {t(outOfStock ? "outOfStock" : "available")}
        </span>
      </div>
      <p>{product.description}</p>
      <div className="row">
        <span className="price">{money(product.price_minor, locale)}</span>
        <Button
          size="sm"
          variant="outline"
          disabled={!ready || outOfStock || state !== "idle"}
          aria-busy={state === "adding"}
          onClick={() => void add()}
        >
          {state === "adding" ? (
            <LoaderCircle size={16} className="animate-spin" />
          ) : state === "added" ? (
            <Check size={16} />
          ) : !outOfStock ? (
            <Plus size={16} />
          ) : null}
          {t(
            outOfStock
              ? "outOfStock"
              : state === "adding"
                ? "adding"
                : state === "added"
                  ? "added"
                  : "add",
          )}
        </Button>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {state === "added" ? t("added") : ""}
      </span>
      {error && (
        <p className="field-error" role="alert">
          {t(error)}
        </p>
      )}
    </article>
  );
}
