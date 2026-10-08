/**
 * 再注文の決まり（価格表・送料・注文番号・お届け先の確かめ方）。
 *
 * 運営者アプリ（selenia-aroma-master）の src/lib/shopSettings.ts・orders.ts・clientContact.ts と
 * 同じ計算。変えるときは両方を直す。価格はすべて税込の円。
 * テスト（node --test）から読めるよう、ほかのファイルに頼らない。
 */

export type PriceItem = { volumeMl: number; price: number };

export type ShopSettings = {
  priceList: PriceItem[];
  shippingFee: number;
  freeShippingOver: number | null;
  acceptOnline: boolean;
  acceptBank: boolean;
  acceptStore: boolean;
  bankTransferNote: string;
  notifyEmail: string;
};

export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  priceList: [],
  shippingFee: 0,
  freeShippingOver: null,
  acceptOnline: false,
  acceptBank: true,
  acceptStore: true,
  bankTransferNote: "",
  notifyEmail: "",
};

function toInt(value: unknown, max = 1_000_000): number | null {
  const number = typeof value === "string" ? Number(value.replace(/[,，円\s]/g, "")) : Number(value);
  return Number.isFinite(number) && number >= 0 && number <= max ? Math.round(number) : null;
}

export function normalizePriceList(value: unknown): PriceItem[] {
  if (!Array.isArray(value)) return [];
  const byVolume = new Map<number, number>();
  for (const item of value as Array<Partial<Record<keyof PriceItem, unknown>>>) {
    const volume = Number(item?.volumeMl);
    const price = toInt(item?.price);
    if (!Number.isFinite(volume) || volume <= 0 || volume > 1000 || price === null || price === 0) continue;
    byVolume.set(Math.round(volume * 10) / 10, price);
  }
  return [...byVolume.entries()]
    .sort(([a], [b]) => a - b)
    .slice(0, 10)
    .map(([volumeMl, price]) => ({ volumeMl, price }));
}

export function normalizeShopSettings(input: Partial<Record<keyof ShopSettings, unknown>>): ShopSettings {
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const freeOver = input.freeShippingOver === null || input.freeShippingOver === "" ? null : toInt(input.freeShippingOver);
  const email = text(input.notifyEmail, 120);
  return {
    priceList: normalizePriceList(input.priceList),
    shippingFee: toInt(input.shippingFee, 100_000) ?? 0,
    freeShippingOver: freeOver,
    acceptOnline: input.acceptOnline === true,
    acceptBank: input.acceptBank === true,
    acceptStore: input.acceptStore === true,
    bankTransferNote: text(input.bankTransferNote, 600),
    notifyEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
  };
}

export type OrderQuote = { unitPrice: number; subtotal: number; shippingFee: number; total: number };

export function quoteOrder(settings: ShopSettings, volumeMl: number, quantity: number): OrderQuote | null {
  const item = settings.priceList.find((entry) => entry.volumeMl === volumeMl);
  if (!item || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return null;
  const subtotal = item.price * quantity;
  const free = settings.freeShippingOver !== null && subtotal >= settings.freeShippingOver;
  const shippingFee = free ? 0 : settings.shippingFee;
  return { unitPrice: item.price, subtotal, shippingFee, total: subtotal + shippingFee };
}

export function yen(value: number): string {
  return `${value.toLocaleString("ja-JP")}円`;
}

/* ---------- 注文 ---------- */

export type OrderStatus = "requested" | "making" | "shipped" | "cancelled";
export type PaymentMethod = "online" | "bank" | "store";
export type PaymentStatus = "unpaid" | "paid" | "refunded";

/** お客様に見せる呼び名。 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  requested: "ご注文を受け付けました",
  making: "お作りしています",
  shipped: "発送しました",
  cancelled: "取り消しました",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  online: "クレジットカード・PayPay など",
  bank: "銀行振込",
  store: "次回ご来店時にお支払い",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "お支払い待ち",
  paid: "お支払い済み",
  refunded: "返金済み",
};

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && value in PAYMENT_METHOD_LABELS;
}

/** 注文番号。「SA-261008-4K7Q」のように、日本時間の日付と、読み違えにくい4文字。 */
export function makeOrderNumber(now: Date, random: () => number = Math.random): string {
  const letters = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const date = jst.toISOString().slice(2, 10).replace(/-/g, "");
  const suffix = Array.from({ length: 4 }, () => letters[Math.floor(random() * letters.length)]).join("");
  return `SA-${date}-${suffix}`;
}

/* ---------- お届け先 ---------- */

/** 同意書の版。正式な文面に差し替えたら上げる（運営者アプリの CONTACT_CONSENT_VERSION と同じ値）。 */
export const CONTACT_CONSENT_VERSION = "draft-1";

export type ContactFields = {
  shipName: string;
  postalCode: string;
  address1: string;
  address2: string;
  phone: string;
  email: string;
};

function toHalfWidth(value: string): string {
  return value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[－ー―‐−]/g, "-")
    .replace(/＋/g, "+");
}

export function normalizePostalCode(value: string): string | null {
  const digits = toHalfWidth(value).replace(/[^0-9]/g, "");
  if (!digits) return "";
  return digits.length === 7 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : null;
}

export function normalizePhone(value: string): string | null {
  const cleaned = toHalfWidth(value).replace(/[^0-9+-]/g, "");
  if (!cleaned) return "";
  const digits = cleaned.replace(/[^0-9]/g, "");
  return digits.length >= 10 && digits.length <= 15 ? cleaned : null;
}

export function normalizeEmail(value: string): string | null {
  const trimmed = toHalfWidth(value).trim();
  if (!trimmed) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 120 ? trimmed : null;
}

export function validateContact(input: Partial<Record<keyof ContactFields, unknown>>):
  | { ok: true; value: ContactFields }
  | { ok: false; errors: Partial<Record<keyof ContactFields, string>> } {
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const errors: Partial<Record<keyof ContactFields, string>> = {};
  const postalCode = normalizePostalCode(typeof input.postalCode === "string" ? input.postalCode : "");
  const phone = normalizePhone(typeof input.phone === "string" ? input.phone : "");
  const email = normalizeEmail(typeof input.email === "string" ? input.email : "");
  if (postalCode === null) errors.postalCode = "郵便番号は7桁の数字で入れてください。";
  if (phone === null) errors.phone = "電話番号は10〜11桁の数字で入れてください。";
  if (email === null) errors.email = "メールアドレスの形を確かめてください。";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      shipName: text(input.shipName, 60),
      postalCode: postalCode ?? "",
      address1: text(input.address1, 120),
      address2: text(input.address2, 80),
      phone: phone ?? "",
      email: email ?? "",
    },
  };
}

export function isShippable(contact: Pick<ContactFields, "postalCode" | "address1" | "phone">): boolean {
  return Boolean(contact.postalCode && contact.address1 && contact.phone);
}
