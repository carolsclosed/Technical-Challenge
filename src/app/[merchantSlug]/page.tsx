import { CatalogView } from "@/components/catalog";
import { notFound } from "next/navigation";
import { readCatalog, readPublicMerchant } from "@/lib/catalog-data";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ merchantSlug: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { merchantSlug } = await params;
  const { q = "", page = "0" } = await searchParams;
  const [{ data, error }, { data: merchant }] = await Promise.all([
    readCatalog({
      merchantSlug,
      search: q,
      offset: (Number(page) || 0) * 24,
    }),
    readPublicMerchant(merchantSlug),
  ]);
  if (error) throw Error("REQUEST_FAILED");
  if (!merchant) notFound();
  return (
    <CatalogView
      catalog={data}
      title={merchant.name}
      query={q}
      page={Number(page) || 0}
    />
  );
}
