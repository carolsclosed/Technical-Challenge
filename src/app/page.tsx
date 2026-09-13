import { CatalogView } from "@/components/catalog";
import { ShellCopy } from "@/components/shell-copy";
import { readCatalog } from "@/lib/catalog-data";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <div className="container">
        <h1>mesa.</h1>
        <p>
          <ShellCopy message="setupInfo" />
        </p>
      </div>
    );
  }
  const { q = "", page = "0" } = await searchParams;
  const index = Math.max(0, Number(page) || 0);
  const { data, error } = await readCatalog({
    search: q,
    offset: index * 24,
  });
  if (error) throw Error("REQUEST_FAILED");
  return <CatalogView catalog={data} query={q} page={index} />;
}
