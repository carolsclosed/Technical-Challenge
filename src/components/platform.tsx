"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Database } from "@/lib/database.types";
import { ModalForm, Action, EditForm } from "./manage";
import { Button } from "./ui/button";

type Merchant = Database["public"]["Tables"]["merchants"]["Row"];
export type MerchantApplication = Pick<
  Merchant,
  "id" | "name" | "slug" | "status" | "rejection_reason" | "created_at"
> & { applicant_email: string };

export function PlatformNavigation() {
  const t = useTranslations();
  return (
    <nav
      className="actions"
      aria-label={t("platform")}
      style={{ marginBottom: 24 }}
    >
      <Button asChild variant="outline">
        <Link href="/platform/merchants">{t("merchants")}</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/platform/applications">{t("applications")}</Link>
      </Button>
    </nav>
  );
}

export function PlatformList({ merchants }: { merchants: Merchant[] }) {
  const t = useTranslations();
  const [status, setStatus] = useState("all");
  return (
    <>
      <div className="section-heading">
        <h1>{t("merchants")}</h1>
        <ModalForm
          title="newMerchant"
          operation="merchant"
          values={{ name: "", slug: "" }}
          fields={[
            { name: "name", required: true },
            { name: "slug", required: true },
          ]}
        />
      </div>
      <div className="filters">
        <select
          aria-label={t("status")}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          {["all", "pending", "active", "rejected", "suspended"].map(
            (status) => (
              <option key={status} value={status}>
                {t(status)}
              </option>
            ),
          )}
        </select>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("merchant")}</th>
              <th>{t("slug")}</th>
              <th>{t("status")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {merchants
              .filter(
                (merchant) => status === "all" || merchant.status === status,
              )
              .map((merchant) => (
                <tr key={merchant.id}>
                  <td>{merchant.name}</td>
                  <td>/{merchant.slug}</td>
                  <td>
                    <span className={"badge " + merchant.status}>
                      {t(merchant.status)}
                    </span>
                  </td>
                  <td>
                    <Link href={"/platform/merchants/" + merchant.id}>
                      {t("manage")} →
                    </Link>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ApplicationsList({
  applications,
}: {
  applications: MerchantApplication[];
}) {
  const t = useTranslations();
  return (
    <>
      <h1>{t("applications")}</h1>
      <p>{t("applicationsInfo")}</p>
      <div className="stack">
        {applications.map((application) => (
          <section className="card card-body stack" key={application.id}>
            <div className="row">
              <div>
                <h2>{application.name}</h2>
                <p>
                  {application.applicant_email} · /{application.slug}
                </p>
              </div>
              <span className={"badge " + application.status}>
                {t(application.status)}
              </span>
            </div>
            {application.rejection_reason && (
              <p>{application.rejection_reason}</p>
            )}
            <div className="actions">
              {application.status === "pending" && (
                <>
                  <Action
                    operation="merchantStatus"
                    values={{ id: application.id, status: "active" }}
                    label="approve"
                    confirm
                  />
                  <ModalForm
                    title="reject"
                    operation="merchantStatus"
                    values={{
                      id: application.id,
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
                  />
                </>
              )}
              <Link href={`/platform/merchants/${application.id}`}>
                {t("manage")} →
              </Link>
            </div>
          </section>
        ))}
        {!applications.length && (
          <div className="empty">{t("noApplications")}</div>
        )}
      </div>
    </>
  );
}

export function MerchantAdmin({ merchant }: { merchant: Merchant }) {
  const t = useTranslations();
  return (
    <>
      <h1>{merchant.name}</h1>
      <div className="actions">
        <span className={"badge " + merchant.status}>{t(merchant.status)}</span>
        {merchant.status === "pending" && (
          <>
            <Action
              operation="merchantStatus"
              values={{ id: merchant.id, status: "active" }}
              label="approve"
              confirm
            />
            <ModalForm
              title="reject"
              operation="merchantStatus"
              values={{ id: merchant.id, status: "rejected", reason: "" }}
              fields={[{ name: "reason", required: true, type: "textarea" }]}
            />
          </>
        )}
        {merchant.status === "active" && (
          <Action
            operation="merchantStatus"
            values={{ id: merchant.id, status: "suspended" }}
            label="suspend"
            confirm
          />
        )}
        {merchant.status === "suspended" && (
          <Action
            operation="merchantStatus"
            values={{ id: merchant.id, status: "active" }}
            label="activate"
            confirm
          />
        )}
      </div>
      <div className="actions">
        <Button asChild variant="outline">
          <Link href={`/${merchant.slug}/dashboard/stores`}>
            {t("manageStores")}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/${merchant.slug}/dashboard/team`}>{t("team")}</Link>
        </Button>
      </div>
      <section className="card card-body" style={{ marginTop: 24 }}>
        <EditForm
          operation="merchantSettings"
          values={{ id: merchant.id, name: merchant.name }}
          fields={[{ name: "name", required: true }]}
        />
      </section>
    </>
  );
}

export function Application({
  status,
}: {
  status?: {
    name: string;
    slug: string;
    status: string;
    rejection_reason?: string | null;
  };
}) {
  const t = useTranslations();
  const router = useRouter();
  return (
    <div className="card form-shell">
      <h1>{t("application")}</h1>
      {!status ? (
        <>
          <p>{t("applicationInfo")}</p>
          <EditForm
            operation="application"
            values={{ name: "", slug: "" }}
            fields={[
              { name: "name", required: true },
              { name: "slug", required: true },
            ]}
            label="apply"
            onDone={() => {
              router.replace("/merchant/status");
              router.refresh();
            }}
          />
        </>
      ) : (
        <>
          <span className={"badge " + status.status}>{t(status.status)}</span>
          <h2>{status.name}</h2>
          {status.status === "pending" && <p>{t("applicationPending")}</p>}
          {status.status === "rejected" && (
            <>
              <p>{status.rejection_reason}</p>
              <EditForm
                operation="resubmit"
                values={{ name: status.name }}
                fields={[{ name: "name", required: true }]}
                label="resubmit"
              />
            </>
          )}
          {["active", "suspended"].includes(status.status) && (
            <Link href={`/${status.slug}/dashboard`}>{t("dashboard")} →</Link>
          )}
        </>
      )}
    </div>
  );
}
