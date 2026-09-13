import { catalogClient } from "@/lib/supabase/catalog";
import type { CartProduct, Catalog } from "@/lib/domain";

const storeFields =
  "id,name,street,city,state,zip_code,phone,timezone,merchant_name,merchant_slug" as const;
const productFields =
  "id,store_id,name,description,price_minor,available" as const;
const cartFields =
  "id,store_id,name,description,price_minor,available,store_name,merchant_slug" as const;

export async function readCatalog(options: {
  merchantSlug?: string;
  storeId?: string;
  search?: string;
  offset?: number;
  limit?: number;
}) {
  const db = catalogClient();
  const limit = Math.max(1, Math.min(options.limit ?? 24, 100));
  const offset = Math.max(0, options.offset ?? 0);
  let stores = db.from("catalog_stores").select(storeFields).order("name");
  if (options.merchantSlug)
    stores = stores.eq("merchant_slug", options.merchantSlug);
  if (options.storeId) stores = stores.eq("id", options.storeId).limit(1);
  else {
    const search = options.search?.trim().slice(0, 120);
    if (search) stores = stores.ilike("search_text", `%${search}%`);
    stores = stores.range(offset, offset + limit - 1);
  }

  const products = options.storeId
    ? db
        .from("catalog_products")
        .select(productFields)
        .eq("store_id", options.storeId)
        .order("name")
        .range(offset, offset + limit - 1)
    : Promise.resolve({ data: [], error: null });
  const [storeResult, productResult] = await Promise.all([stores, products]);
  return {
    data: {
      stores: (storeResult.data ?? []) as unknown as Catalog["stores"],
      products: (productResult.data ?? []) as unknown as Catalog["products"],
    },
    error: storeResult.error ?? productResult.error,
  };
}

export async function readPublicMerchant(slug: string) {
  return catalogClient()
    .from("merchants")
    .select("id,name,slug")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
}

export async function readCartProducts(ids: string[]) {
  if (!ids.length) return { data: [] as CartProduct[], error: null };
  const result = await catalogClient()
    .from("catalog_products")
    .select(cartFields)
    .in("id", ids.slice(0, 100));
  return {
    ...result,
    data: (result.data ?? []) as unknown as CartProduct[],
  };
}
