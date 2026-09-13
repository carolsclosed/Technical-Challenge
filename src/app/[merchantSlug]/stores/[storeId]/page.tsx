import { CatalogView } from "@/components/catalog";
import { notFound } from "next/navigation";
import { readCatalog } from "@/lib/catalog-data";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ merchantSlug: string; storeId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ merchantSlug, storeId }, { page = "0" }] = await Promise.all([
    params,
    searchParams,
  ]);
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) notFound();
  const index = Math.max(0, Math.floor(Number(page) || 0));
  const { data: catalog, error } = await readCatalog({
    merchantSlug,
    storeId,
    offset: index * 24,
  });
  if (error) throw Error("REQUEST_FAILED");
  if (!catalog.stores.length) notFound();
  return <CatalogView catalog={catalog} storePage page={index} />;
}
