"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Store,
  ShoppingBag,
  Users,
  Settings,
  Package,
} from "lucide-react";

export function DashboardShell({
  children,
  slug,
  name,
  role,
  status,
  platform = false,
}: {
  children: React.ReactNode;
  slug: string;
  name: string;
  role: string;
  status: string;
  platform?: boolean;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const admin = role === "admin";
  const canManage = status === "active" || platform;
  const links = [
    ...(admin ? [["", "dashboard", LayoutDashboard]] : []),
    ...(canManage
      ? [["/stores", admin ? "stores" : "products", admin ? Store : Package]]
      : []),
    ...(!platform ? [["/orders", "openOrders", ShoppingBag]] : []),
    ...(admin && canManage
      ? [
          ["/team", "team", Users],
          ["/settings", "settings", Settings],
        ]
      : []),
  ] as const;
  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <h3>{name}</h3>
        <small>{t(platform ? "superadmin" : role)}</small>
        {platform && <Link href="/platform">← {t("platform")}</Link>}
        {links.map(([path, label, Icon]) => {
          const href = `/${slug}/dashboard${path}`;
          const selected = path ? pathname.startsWith(href) : pathname === href;
          return (
            <Link
              key={String(path)}
              href={href}
              aria-current={selected ? "page" : undefined}
            >
              <Icon size={18} />
              {t(String(label))}
            </Link>
          );
        })}
      </aside>
      <div className="dashboard-main">
        {status === "suspended" && (
          <div className="notice error">{t("suspendedInfo")}</div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Overview({
  counts,
}: {
  counts: { stores: number; products: number; orders?: number };
}) {
  const t = useTranslations();
  return (
    <>
      <h1>{t("dashboard")}</h1>
      <div className="stats">
        {Object.entries(counts).map(([key, value]) => (
          <div key={key} className="card stat">
            <span className="muted">{t(key)}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </>
  );
}
