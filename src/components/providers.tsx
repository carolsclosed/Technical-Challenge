"use client";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "next-themes";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useSyncExternalStore,
} from "react";
import { messages } from "@/lib/messages";
import type { CartLine } from "@/lib/domain";
import { CartSession, emptyCartSnapshot } from "@/lib/cart-session";
import { browserClient } from "@/lib/supabase/client";
import { navigateAfterAuth } from "@/lib/auth-navigation";
const Ctx = createContext<{
  lines: CartLine[];
  setLines: (v: CartLine[] | ((x: CartLine[]) => CartLine[])) => boolean;
  ready: boolean;
  cartScope: string;
  cartEpoch: number;
  suspendCart: () => void;
  resumeCart: () => Promise<void>;
  locale: "en" | "pt-PT";
  setLocale: (v: "en" | "pt-PT") => void;
}>({
  lines: [],
  setLines: () => false,
  ready: false,
  cartScope: "",
  cartEpoch: 0,
  suspendCart: () => {},
  resumeCart: async () => {},
  locale: "en",
  setLocale: () => {},
});
export const useApp = () => useContext(Ctx);
export function Providers({
  children,
  locale: initial,
}: {
  children: React.ReactNode;
  locale: "en" | "pt-PT";
}) {
  const [locale, setLanguage] = useState(initial);
  const [cart] = useState(() => new CartSession());
  const snapshot = useSyncExternalStore(
    cart.subscribe,
    cart.getSnapshot,
    () => emptyCartSnapshot,
  );
  const resume = useRef<() => Promise<void>>(async () => {});
  const explicitAuthChange = useRef(false);
  useEffect(() => {
    const db = browserClient();
    let stopped = false;
    try {
      cart.attach(window.localStorage);
    } catch {
      cart.attach();
    }

    let identifying = Promise.resolve();
    async function identify(
      epoch: number,
      hint: string | null,
      transfer: boolean,
    ) {
      if (stopped || epoch !== cart.getSnapshot().epoch) return;
      let userId: string | null = null;
      if (hint) {
        const {
          data: { user },
          error,
        } = await db.auth.getUser();
        if (stopped || epoch !== cart.getSnapshot().epoch) return;
        if (error || !user || user.id !== hint) throw Error("authError");
        userId = user.id;
      }
      if (stopped) return;
      const resolve = () => {
        if (!stopped) cart.resolve(epoch, userId, transfer);
      };
      // Web Locks serialize a guest transfer across tabs. The transfer ID also
      // makes repeated SIGNED_IN events idempotent without combining accounts.
      if (transfer && navigator.locks)
        await navigator.locks.request("mesa-guest-cart-transfer", resolve);
      else resolve();
    }
    resume.current = async () => {
      const {
        data: { session },
        error,
      } = await db.auth.getSession();
      if (error) throw error;
      identifying = identify(
        cart.suspend(),
        session?.user.id ?? null,
        cart.getOwner() === null,
      );
      // A newer auth event can supersede this lookup. Wait for that identity
      // too before the sign-in page performs a full navigation.
      let current;
      do {
        current = identifying;
        await current;
      } while (current !== identifying);
      if (!cart.getSnapshot().ready) throw Error("authError");
    };
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((event, session) => {
      const hint = session?.user.id ?? null;
      if (cart.getSnapshot().ready && cart.getOwner() === hint) return;
      const previous = cart.getOwner();
      // Hide the previous identity synchronously, then call Auth outside its
      // state-change callback lock to avoid an Auth-js deadlock.
      const epoch = cart.suspend();
      // Discard server-rendered identity immediately for changes from another
      // tab, including when a later network lookup cannot complete. Local
      // forms finish their cart handoff before choosing their destination.
      if (
        previous !== undefined &&
        previous !== hint &&
        !explicitAuthChange.current
      ) {
        navigateAfterAuth(window.location.pathname + window.location.search);
      }
      identifying = new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          void identify(epoch, hint, event === "SIGNED_IN").then(
            resolve,
            reject,
          );
        }, 0);
      });
      // Remain empty on a failed identity lookup; focus/resume can retry.
      void identifying.catch(() => {});
    });
    const storage = (event: StorageEvent) => cart.reload(event.key);
    const focus = () => {
      if (!cart.getSnapshot().ready) void resume.current().catch(() => {});
    };
    window.addEventListener("storage", storage);
    window.addEventListener("focus", focus);
    return () => {
      stopped = true;
      subscription.unsubscribe();
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", focus);
    };
  }, [cart]);
  const setLines = useCallback(
    (v: CartLine[] | ((x: CartLine[]) => CartLine[])) =>
      cart.update(snapshot.epoch, v),
    [cart, snapshot.epoch],
  );
  const suspendCart = useCallback(() => {
    explicitAuthChange.current = true;
    cart.suspend();
  }, [cart]);
  const resumeCart = useCallback(async () => {
    try {
      await resume.current();
    } finally {
      explicitAuthChange.current = false;
    }
  }, []);
  const setLocale = (v: "en" | "pt-PT") => {
    setLanguage(v);
    document.cookie = `locale=${v};path=/;max-age=31536000;samesite=lax`;
    document.documentElement.lang = v;
  };
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages[locale]}
      timeZone="Europe/Lisbon"
    >
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <Ctx.Provider
          value={{
            lines: snapshot.lines,
            setLines,
            ready: snapshot.ready,
            cartScope: snapshot.scope,
            cartEpoch: snapshot.epoch,
            suspendCart,
            resumeCart,
            locale,
            setLocale,
          }}
        >
          {children}
        </Ctx.Provider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
