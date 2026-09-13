import type { CartLine } from "./domain";

export const guestCartKey = "mesa-cart:v2:guest";
export const accountCartKey = (userId: string) => `mesa-cart:v2:user:${userId}`;
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type CartRecord = { id: string; lines: CartLine[]; transferred: string[] };
export type CartSnapshot = {
  ready: boolean;
  scope: string;
  epoch: number;
  lines: CartLine[];
};
export const emptyCartSnapshot: CartSnapshot = {
  ready: false,
  scope: "",
  epoch: 0,
  lines: [],
};

export function normalizeCart(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  const lines = new Map<string, number>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { product_id: id, quantity } = item;
    if (
      typeof id !== "string" ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) ||
      !Number.isInteger(quantity) ||
      quantity < 1
    )
      continue;
    if (!lines.has(id) && lines.size >= 100) continue;
    lines.set(id, Math.min(99, (lines.get(id) ?? 0) + quantity));
  }
  return [...lines].map(([product_id, quantity]) => ({ product_id, quantity }));
}

// One controller per mounted provider. Epochs reject late cart updates from a
// product/order request that started under a different authentication identity.
export class CartSession {
  private storage?: StoragePort;
  private owner: string | null | undefined;
  private snapshot = emptyCartSnapshot;
  private listeners = new Set<() => void>();
  private record: CartRecord = { id: "", lines: [], transferred: [] };
  getSnapshot = () => this.snapshot;
  getOwner = () => this.owner;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(snapshot: CartSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  attach(storage?: StoragePort) {
    this.storage = storage;
    // The old global key has no trustworthy owner, so it must never be imported.
    try {
      storage?.removeItem("mesa-cart");
    } catch {}
  }
  private read(key: string): CartRecord {
    try {
      const value = JSON.parse(this.storage?.getItem(key) ?? "null");
      return {
        id: typeof value?.id === "string" ? value.id : "",
        lines: normalizeCart(value?.lines),
        transferred: Array.isArray(value?.transferred)
          ? value.transferred
              .filter((id: unknown) => typeof id === "string")
              .slice(-32)
          : [],
      };
    } catch {
      return { id: "", lines: [], transferred: [] };
    }
  }
  private write(key: string, record: CartRecord) {
    try {
      this.storage?.setItem(key, JSON.stringify(record));
      return true;
    } catch {
      return false;
    }
  }
  suspend = () => {
    const epoch = this.snapshot.epoch + 1;
    this.publish({ ready: false, scope: "", epoch, lines: [] });
    return epoch;
  };
  resolve(epoch: number, userId: string | null, transferGuest = false) {
    if (epoch !== this.snapshot.epoch) return;
    const scope = userId ? accountCartKey(userId) : guestCartKey;
    let record = this.read(scope);
    if (userId && transferGuest && this.owner === null) {
      const guest = this.read(guestCartKey);
      if (
        guest.lines.length &&
        guest.id &&
        !record.transferred.includes(guest.id)
      ) {
        record = {
          ...record,
          lines: normalizeCart([...record.lines, ...guest.lines]),
          transferred: [...record.transferred, guest.id].slice(-32),
        };
        if (this.write(scope, record)) {
          try {
            this.storage?.removeItem(guestCartKey);
          } catch {}
        }
      }
    }
    this.owner = userId;
    this.record = record;
    this.publish({ ready: true, scope, epoch, lines: record.lines });
  }
  update(
    epoch: number,
    change: CartLine[] | ((lines: CartLine[]) => CartLine[]),
  ) {
    if (!this.snapshot.ready || epoch !== this.snapshot.epoch) return false;
    const lines = normalizeCart(
      typeof change === "function"
        ? change(this.snapshot.lines.map((line) => ({ ...line })))
        : change,
    );
    this.record = {
      ...this.record,
      id: this.record.id || crypto.randomUUID(),
      lines,
    };
    this.write(this.snapshot.scope, this.record);
    this.publish({ ...this.snapshot, lines });
    return true;
  }
  reload(key: string | null) {
    if (!this.snapshot.ready || (key !== null && key !== this.snapshot.scope))
      return;
    this.record = this.read(this.snapshot.scope);
    this.publish({ ...this.snapshot, lines: this.record.lines });
  }
}
