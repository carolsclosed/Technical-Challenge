import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

let client: ReturnType<typeof createClient<Database>> | undefined;

/**
 * Catalog traffic intentionally has no user session. It therefore runs as the
 * `anon` database role and can see only the public columns and active rows
 * granted by catalog RLS policies.
 */
export function catalogClient() {
  client ??= createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  return client;
}
