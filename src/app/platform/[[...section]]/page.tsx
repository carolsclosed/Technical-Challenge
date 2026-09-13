import { requirePlatform } from "@/lib/auth";
import {
  PlatformList,
  MerchantAdmin,
  ApplicationsList,
  PlatformNavigation,
  type MerchantApplication,
} from "@/components/platform";
import {
  InviteForm,
  Invitations,
  Team,
  PageTitle,
  type Invitation,
  type TeamMember,
} from "@/components/manage";
import { notFound } from "next/navigation";
import { readTeamData } from "@/lib/team-data";

export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section = [] } = await params;
  const { db } = await requirePlatform();
  let content;
  if (!section.length || (section.length === 1 && section[0] === "merchants")) {
    const { data, error } = await db
      .from("merchants")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw Error("REQUEST_FAILED");
    content = <PlatformList merchants={data ?? []} />;
  } else if (section.length === 1 && section[0] === "applications") {
    const { data, error } = await db
      .from("merchants")
      .select(
        "id,name,slug,status,rejection_reason,created_at,applicant_email",
      )
      .in("status", ["pending", "rejected"])
      .not("applicant_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw Error("REQUEST_FAILED");
    content = (
      <ApplicationsList
        applications={(data ?? []) as MerchantApplication[]}
      />
    );
  } else {
    if (section.length !== 2 || section[0] !== "merchants") notFound();
    const { data: merchant } = await db
      .from("merchants")
      .select("*")
      .eq("id", section[1])
      .single();
    if (!merchant) notFound();
    const [team, { data: stores, error: storeError }] = await Promise.all([
      readTeamData(db, merchant.id),
      db
        .from("stores")
        .select("id,name")
        .eq("merchant_id", merchant.id)
        .order("name"),
    ]);
    if (team.error || storeError) throw Error("REQUEST_FAILED");
    content = (
      <div className="stack">
        <MerchantAdmin merchant={merchant} />
        <PageTitle title="team" />
        {merchant.status !== "rejected" && (
          <InviteForm
            merchant={merchant.id}
            initial={merchant.status === "pending"}
            stores={stores ?? []}
          />
        )}
        <Team
          members={team.members as TeamMember[]}
          stores={stores ?? []}
        />
        <Invitations items={team.invitations as Invitation[]} />
      </div>
    );
  }
  return (
    <div className="container">
      <PlatformNavigation />
      {content}
    </div>
  );
}
