"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "./ui/button";
import { Confirm } from "./ui/confirm";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { mutate, invite, type Operation } from "@/app/actions/business";
import { money } from "@/lib/display";
import { useApp } from "./providers";
import type { Database } from "@/lib/database.types";
type Store = Database["public"]["Tables"]["stores"]["Row"];
type Product = Database["public"]["Tables"]["products"]["Row"];
type Field = {
  name: string;
  label?: string;
  type?: string;
  required?: boolean;
  options?: string[];
  max?: number;
};
export function EditForm({
  operation,
  values,
  fields,
  label,
  onDone,
}: {
  operation: Operation;
  values: Record<string, unknown>;
  fields: Field[];
  label?: string;
  onDone?: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Record<string, unknown>>({ defaultValues: values });
  const [message, setMessage] = useState("");
  return (
    <form
      className="stack"
      onSubmit={handleSubmit(async (v) => {
        setMessage("");
        const result = await mutate(operation, { ...values, ...v });
        setMessage(result.ok ? "saved" : result.error!);
        if (result.ok) {
          router.refresh();
          onDone?.();
        }
      })}
    >
      <div className="form-grid">
        {fields.map((f) => (
          <div key={f.name} className={f.type === "textarea" ? "span-2" : ""}>
            <label htmlFor={`${operation}-${f.name}`}>
              {t(f.label ?? f.name)}
            </label>
            {f.options ? (
              <select
                id={`${operation}-${f.name}`}
                {...register(f.name, { required: f.required })}
              >
                {f.options.map((v) => (
                  <option key={v} value={v}>
                    {[
                      "admin",
                      "staff",
                      "operator",
                      "en",
                      "pt-PT",
                      "system",
                      "light",
                      "dark",
                    ].includes(v) && !["en", "pt-PT"].includes(v)
                      ? t(v)
                      : v}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                id={`${operation}-${f.name}`}
                {...register(f.name, { maxLength: f.max ?? 2000 })}
              />
            ) : (
              <input
                id={`${operation}-${f.name}`}
                type={f.type ?? "text"}
                {...register(f.name, {
                  required: f.required,
                  maxLength: f.max,
                })}
              />
            )}{" "}
            {errors[f.name] && (
              <span className="field-error">{t("VALIDATION_ERROR")}</span>
            )}
          </div>
        ))}
      </div>
      {message && (
        <div
          role="status"
          className={"notice " + (message === "saved" ? "" : "error")}
        >
          {t(message)}
        </div>
      )}
      <Button disabled={isSubmitting}>
        {t(isSubmitting ? "loading" : (label ?? "save"))}
      </Button>
    </form>
  );
}
export function ModalForm({
  title,
  operation,
  values,
  fields,
}: {
  title: string;
  operation: Operation;
  values: Record<string, unknown>;
  fields: Field[];
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t(title)}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{t(title)}</DialogTitle>
        <DialogDescription className="muted">
          {t(
            operation === "store"
              ? "stores"
              : operation === "product"
                ? "products"
                : "merchant",
          )}
        </DialogDescription>
        <EditForm
          operation={operation}
          values={values}
          fields={fields}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
export function Action({
  operation,
  values,
  label,
  confirm = false,
}: {
  operation: Operation;
  values: Record<string, unknown>;
  label: string;
  confirm?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const r = await mutate(operation, values);
    setBusy(false);
    if (!r.ok) setError(r.error!);
    else {
      setError("");
      router.refresh();
    }
  };
  const button = (
    <Button
      size="sm"
      variant={confirm ? "outline" : "ghost"}
      disabled={busy}
      onClick={confirm ? undefined : run}
    >
      {t(label)}
    </Button>
  );
  return (
    <div>
      {confirm ? (
        <Confirm title={t(label)} onConfirm={run}>
          {button}
        </Confirm>
      ) : (
        button
      )}
      {error && (
        <div className="field-error" role="alert">
          {t(error)}
        </div>
      )}
    </div>
  );
}
const storeFields: Field[] = [
  { name: "name", required: true, max: 120 },
  { name: "street", required: true, max: 200 },
  { name: "city", required: true, max: 100 },
  { name: "state", required: true, max: 100 },
  { name: "zip_code", required: true, max: 20 },
  { name: "phone", required: true, type: "tel" },
  { name: "timezone", required: true },
  { name: "active", type: "checkbox" },
];
const productFields: Field[] = [
  { name: "name", required: true, max: 120 },
  { name: "price", required: true },
  { name: "description", type: "textarea", max: 2000 },
  { name: "available", type: "checkbox" },
];
export function StoresManager({
  stores,
  merchant,
  slug,
  role,
  active = true,
}: {
  stores: Store[];
  merchant: string;
  slug: string;
  role: string;
  active?: boolean;
}) {
  const t = useTranslations();
  const canManage = active && role === "admin";
  return (
    <>
      <div className="section-heading">
        <h1>{t(role === "admin" ? "stores" : "products")}</h1>
        {canManage && (
          <ModalForm
            title="newStore"
            operation="store"
            values={{
              merchant,
              name: "",
              street: "",
              city: "",
              state: "",
              zip_code: "",
              phone: "",
              timezone: "Europe/Lisbon",
              active: true,
            }}
            fields={storeFields}
          />
        )}
      </div>
      <div className="grid">
        {stores.map((s) => (
          <div className="card card-body" key={s.id}>
            <div className="row">
              <h3>{s.name}</h3>
              <span className="badge">
                {t(s.active ? "active" : "inactive")}
              </span>
            </div>
            <p>
              {s.street}
              <br />
              {s.city} · {s.timezone}
            </p>
            <div className="actions">
              {active && (
                <Button asChild size="sm">
                  <Link href={`/${slug}/dashboard/stores/${s.id}`}>
                    {t("products")}
                  </Link>
                </Button>
              )}
              {canManage && (
                <>
                  <ModalForm
                    title="edit"
                    operation="store"
                    values={{ ...s, merchant }}
                    fields={storeFields}
                  />
                  <Action
                    operation="store"
                    values={{ ...s, merchant, active: !s.active }}
                    label={s.active ? "deactivate" : "reactivate"}
                    confirm
                  />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {!stores.length && (
        <div className="empty">
          {t(role === "admin" ? "empty" : "noAssignedStores")}
        </div>
      )}
    </>
  );
}
export function ProductsManager({
  products,
  store,
  role,
}: {
  products: Product[];
  store: Store;
  role: string;
}) {
  const t = useTranslations();
  const { locale } = useApp();
  return (
    <>
      <div className="section-heading">
        <div>
          <small>{t("products")}</small>
          <h1>{store.name}</h1>
        </div>
        {role !== "operator" && (
          <ModalForm
            title="newProduct"
            operation="product"
            values={{
              store: store.id,
              name: "",
              description: "",
              price: "",
              available: true,
            }}
            fields={productFields}
          />
        )}
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("name")}</th>
              <th>{t("price")}</th>
              <th>{t("availability")}</th>
              <th>{t("manage")}</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  <div className="muted">{p.description}</div>
                </td>
                <td>{money(p.price_minor, locale)}</td>
                <td>
                  <Action
                    operation="availability"
                    values={{
                      id: p.id,
                      version: p.version,
                      available: !p.available,
                    }}
                    label={p.available ? "available" : "unavailable"}
                  />
                </td>
                <td>
                  <div className="actions">
                    {role !== "operator" && (
                      <>
                        <ModalForm
                          title="edit"
                          operation="product"
                          values={{
                            ...p,
                            store: store.id,
                            price: (p.price_minor / 100).toFixed(2),
                          }}
                          fields={productFields}
                        />
                        <Action
                          operation="archive"
                          values={{ id: p.id, version: p.version }}
                          label="remove"
                          confirm
                        />
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!products.length && <div className="empty">{t("empty")}</div>}
      </div>
    </>
  );
}
export function InviteForm({
  merchant,
  initial = false,
  stores = [],
}: {
  merchant: string;
  initial?: boolean;
  stores?: { id: string; name: string }[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const { locale } = useApp();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState("admin");
  return (
    <form
      className="stack invite-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setMessage("");
        const values = new FormData(event.currentTarget);
        try {
          const result = await invite({
            merchant,
            email: values.get("email"),
            role: initial ? "admin" : role,
            stores: role === "admin" ? [] : values.getAll("stores"),
            locale,
          });
          setMessage(result.ok ? "inviteSent" : result.error!);
          router.refresh();
        } catch {
          setMessage("inviteFailed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{t("invite")}</h3>
      <div className="form-grid">
        <div>
          <label htmlFor="invite-email">{t("email")}</label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            disabled={busy}
          />
        </div>
        {!initial && (
          <div>
            <label htmlFor="invite-role">{t("role")}</label>
            <select
              id="invite-role"
              name="role"
              value={role}
              disabled={busy}
              onChange={(event) => setRole(event.target.value)}
            >
              {["admin", "staff", "operator"].map((role) => (
                <option value={role} key={role}>
                  {t(role)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {role !== "admin" && (
        <fieldset className="stack" disabled={busy}>
          <legend>{t("assignedStores")}</legend>
          {stores.map((store) => (
            <label className="assignment-option" key={store.id}>
              <input type="checkbox" name="stores" value={store.id} />
              {store.name}
            </label>
          ))}
          <small>{t("assignmentInfo")}</small>
        </fieldset>
      )}
      {message && (
        <div
          className={"notice" + (message === "inviteSent" ? "" : " error")}
          role="status"
        >
          {t(message)}
        </div>
      )}
      <Button disabled={busy}>{t(busy ? "loading" : "invite")}</Button>
    </form>
  );
}
export type Invitation = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  delivery_state: string;
};
export function Invitations({ items }: { items: Invitation[] }) {
  const t = useTranslations();
  const { locale } = useApp();
  return (
    <div className="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t("email")}</th>
            <th>{t("role")}</th>
            <th>{t("expires")}</th>
            <th>{t("status")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>{i.email}</td>
              <td>{t(i.role)}</td>
              <td>{new Date(i.expires_at).toLocaleDateString(locale)}</td>
              <td>
                {t(
                  i.accepted_at
                    ? "accepted"
                    : i.revoked_at
                      ? "cancelled"
                      : i.delivery_state,
                )}
              </td>
              <td>
                {!i.accepted_at && !i.revoked_at && (
                  <Action
                    operation="revoke"
                    values={{ id: i.id }}
                    label="revoke"
                    confirm
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export type TeamMember =
  Database["public"]["Tables"]["merchant_memberships"]["Row"] & {
    email?: string;
    store_ids?: string[];
  };
export function Team({
  members,
  stores = [],
}: {
  members: TeamMember[];
  stores?: { id: string; name: string }[];
}) {
  const t = useTranslations();
  return (
    <div className="stack">
      {members.map((m) => (
        <div className="card card-body stack" key={m.id}>
          <div className="row">
            <strong>{m.email ?? m.user_id}</strong>
            <span className="badge">{t(m.active ? "active" : "inactive")}</span>
          </div>
          <EditForm
            key={`${m.role}-${m.active}`}
            operation="member"
            values={{ id: m.id, role: m.role, active: m.active }}
            fields={[
              { name: "role", options: ["admin", "staff", "operator"] },
              { name: "active", type: "checkbox" },
            ]}
          />
          {m.role === "admin" ? (
            <p className="muted">{t("adminAllStores")}</p>
          ) : (
            <StoreAssignments
              key={(m.store_ids ?? []).join(",")}
              member={m}
              stores={stores}
            />
          )}
        </div>
      ))}
      {!members.length && <div className="empty">{t("empty")}</div>}
    </div>
  );
}
function StoreAssignments({
  member,
  stores,
}: {
  member: TeamMember;
  stores: { id: string; name: string }[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [selected, setSelected] = useState(member.store_ids ?? []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          const result = await mutate("assignStores", {
            id: member.id,
            stores: selected,
          });
          setMessage(result.ok ? "saved" : result.error!);
          if (result.ok) router.refresh();
        } catch {
          setMessage("REQUEST_FAILED");
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset className="stack">
        <legend>{t("assignedStores")}</legend>
        {stores.map((store) => (
          <label className="assignment-option" key={store.id}>
            <input
              type="checkbox"
              checked={selected.includes(store.id)}
              onChange={(event) =>
                setSelected((old) =>
                  event.target.checked
                    ? [...old, store.id]
                    : old.filter((id) => id !== store.id),
                )
              }
            />
            {store.name}
          </label>
        ))}
        <small>{t("assignmentInfo")}</small>
      </fieldset>
      {message && (
        <p role="status" className="notice">
          {t(message)}
        </p>
      )}
      <Button variant="outline" disabled={busy}>
        {t(busy ? "loading" : "saveAssignments")}
      </Button>
    </form>
  );
}
export function PageTitle({ title }: { title: string }) {
  const t = useTranslations();
  return <h1>{t(title)}</h1>;
}
