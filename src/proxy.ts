import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-mesa-user-email");
  const next = () =>
    NextResponse.next({ request: { headers: requestHeaders } });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return next();
  // There is no session to refresh for a guest. Avoid an Auth request on every
  // anonymous catalogue/search navigation and keep email hooks out of this path.
  if (
    !request.cookies
      .getAll()
      .some((cookie) => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name))
  )
    return next();
  const cookieUpdates: {
    name: string;
    value: string;
    options: CookieOptions;
  }[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items) => {
          cookieUpdates.push(...items);
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          requestHeaders.set("cookie", request.cookies.toString());
        },
      },
    },
  );
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims.email === "string")
    requestHeaders.set("x-mesa-user-email", data.claims.email);
  const response = next();
  cookieUpdates.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options),
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/((?!api/auth/email|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)",
  ],
};
