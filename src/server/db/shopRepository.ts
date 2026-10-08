import type { Viewer } from "./access.ts";
import type { QueryRunner } from "./runner.ts";
import {
  CONTACT_CONSENT_VERSION,
  isShippable,
  makeOrderNumber,
  normalizeShopSettings,
  quoteOrder,
  type ContactFields,
  type OrderQuote,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type ShopSettings,
} from "../../lib/shop.ts";

/**
 * 再注文まわりの問い合わせ（お客様本人の操作）。表は cloudflare/d1/0006_shop_orders.sql。
 *
 * お客様が触れるのは、自分のお届け先と、自分の注文だけ。誰の分かは Viewer だけで決め、
 * リクエストからユーザー ID を受け取らない（repositories.ts と同じ考え方）。
 */

/* ---------- ショップの設定 ---------- */

type SettingsRow = {
  price_list: string;
  shipping_fee: number;
  free_shipping_over: number | null;
  accept_online: number;
  accept_bank: number;
  accept_store: number;
  bank_transfer_note: string;
  notify_email: string;
};

export async function readShopSettings(db: QueryRunner): Promise<ShopSettings> {
  const row = await db
    .first<SettingsRow>(
      `select price_list, shipping_fee, free_shipping_over, accept_online, accept_bank, accept_store,
              bank_transfer_note, notify_email
         from shop_settings where id = 'default'`,
      [],
    )
    .catch(() => null);
  if (!row) return normalizeShopSettings({});
  let priceList: unknown = [];
  try {
    priceList = JSON.parse(row.price_list);
  } catch {
    priceList = [];
  }
  return normalizeShopSettings({
    priceList,
    shippingFee: row.shipping_fee,
    freeShippingOver: row.free_shipping_over,
    acceptOnline: row.accept_online === 1,
    acceptBank: row.accept_bank === 1,
    acceptStore: row.accept_store === 1,
    bankTransferNote: row.bank_transfer_note,
    notifyEmail: row.notify_email,
  });
}

/* ---------- お届け先 ---------- */

export type OwnContact = ContactFields & { consentObtainedAt: string | null };

const EMPTY_CONTACT: OwnContact = {
  shipName: "",
  postalCode: "",
  address1: "",
  address2: "",
  phone: "",
  email: "",
  consentObtainedAt: null,
};

function assertCustomer(viewer: Viewer): asserts viewer is { role: "customer"; userId: string } {
  if (viewer.role !== "customer") throw new Error("お客様ご本人の操作です");
}

export async function readOwnContact(db: QueryRunner, viewer: Viewer): Promise<OwnContact> {
  if (viewer.role !== "customer") return EMPTY_CONTACT;
  const row = await db
    .first<{
      ship_name: string;
      postal_code: string;
      address1: string;
      address2: string;
      phone: string;
      email: string;
      consent_obtained_at: string | null;
    }>(
      `select ship_name, postal_code, address1, address2, phone, email, consent_obtained_at
         from client_contacts where user_id = ?`,
      [viewer.userId],
    )
    .catch(() => null);
  if (!row) return EMPTY_CONTACT;
  return {
    shipName: row.ship_name,
    postalCode: row.postal_code,
    address1: row.address1,
    address2: row.address2,
    phone: row.phone,
    email: row.email,
    consentObtainedAt: row.consent_obtained_at,
  };
}

/**
 * お届け先を保存する。まだ同意の記録が無ければ、giveConsent が true のときだけ
 * 同意（アプリで）を記録してから保存する。
 */
export async function saveOwnContact(
  db: QueryRunner,
  viewer: Viewer,
  fields: ContactFields,
  giveConsent: boolean,
): Promise<"ok" | "no_consent"> {
  assertCustomer(viewer);
  const current = await readOwnContact(db, viewer);
  if (!current.consentObtainedAt && !giveConsent) return "no_consent";
  await db.run(
    `insert into client_contacts (user_id, ship_name, postal_code, address1, address2, phone, email,
       consent_obtained_at, consent_version, consent_method, consent_obtained_by, updated_by)
     values (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, 'online', ?, ?)
     on conflict(user_id) do update set
       ship_name = excluded.ship_name, postal_code = excluded.postal_code,
       address1 = excluded.address1, address2 = excluded.address2,
       phone = excluded.phone, email = excluded.email,
       consent_obtained_at = coalesce(client_contacts.consent_obtained_at, excluded.consent_obtained_at),
       consent_version = case when client_contacts.consent_obtained_at is null then excluded.consent_version else client_contacts.consent_version end,
       consent_method = case when client_contacts.consent_obtained_at is null then excluded.consent_method else client_contacts.consent_method end,
       consent_obtained_by = case when client_contacts.consent_obtained_at is null then excluded.consent_obtained_by else client_contacts.consent_obtained_by end,
       updated_by = excluded.updated_by, updated_at = datetime('now')`,
    [
      viewer.userId,
      fields.shipName,
      fields.postalCode,
      fields.address1,
      fields.address2,
      fields.phone,
      fields.email,
      CONTACT_CONSENT_VERSION,
      viewer.userId,
      viewer.userId,
    ],
  );
  return "ok";
}

/* ---------- 注文 ---------- */

/** お客様に見せる注文。施術者の控え（operator_note）は含めない。 */
export type OwnOrder = {
  id: string;
  orderNumber: string;
  aromaRecordId: string | null;
  aromaTitle: string;
  volumeMl: number;
  quantity: number;
  unitPrice: number;
  shippingFee: number;
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  lotNumber: string;
  trackingNumber: string;
  createdAt: string;
  paidAt: string | null;
  shippedAt: string | null;
};

type OrderRow = {
  id: string;
  order_number: string;
  aroma_record_id: string | null;
  aroma_title: string;
  volume_ml: number;
  quantity: number;
  unit_price: number;
  shipping_fee: number;
  total: number;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  lot_number: string;
  tracking_number: string;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
};

const ORDER_COLUMNS = `id, order_number, aroma_record_id, aroma_title, volume_ml, quantity, unit_price, shipping_fee,
  total, status, payment_method, payment_status, lot_number, tracking_number, created_at, paid_at, shipped_at`;

function toOwnOrder(row: OrderRow): OwnOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    aromaRecordId: row.aroma_record_id,
    aromaTitle: row.aroma_title,
    volumeMl: row.volume_ml,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    shippingFee: row.shipping_fee,
    total: row.total,
    status: row.status,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    lotNumber: row.lot_number,
    trackingNumber: row.tracking_number,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    shippedAt: row.shipped_at,
  };
}

export async function listOwnOrders(db: QueryRunner, viewer: Viewer): Promise<OwnOrder[]> {
  if (viewer.role !== "customer") return [];
  const rows = await db
    .all<OrderRow>(`select ${ORDER_COLUMNS} from orders where user_id = ? order by created_at desc limit 100`, [viewer.userId])
    .catch(() => [] as OrderRow[]);
  return rows.map(toOwnOrder);
}

export async function findOwnOrder(db: QueryRunner, viewer: Viewer, id: string): Promise<OwnOrder | null> {
  if (viewer.role !== "customer") return null;
  const row = await db
    .first<OrderRow>(`select ${ORDER_COLUMNS} from orders where id = ? and user_id = ?`, [id, viewer.userId])
    .catch(() => null);
  return row ? toOwnOrder(row) : null;
}

export type NewOrderInput = {
  aromaRecordId: string;
  volumeMl: number;
  quantity: number;
  paymentMethod: PaymentMethod;
  customerNote: string;
};

export type CreateOrderResult =
  | { ok: true; order: OwnOrder; quote: OrderQuote; email: string }
  | { ok: false; reason: "not_found" | "closed" | "invalid" | "method" | "no_address" };

/**
 * 注文を作る。金額は価格表から出し直す（画面から送られた金額は使わない）。
 * 届け先は、その時点のお届け先を写す。onlineAvailable は、決済のキーが入っているか。
 */
export async function createOrder(
  db: QueryRunner,
  viewer: Viewer,
  input: NewOrderInput,
  options: { onlineAvailable: boolean; now?: Date; random?: () => number },
): Promise<CreateOrderResult> {
  assertCustomer(viewer);
  const record = await db.first<{ id: string; title: string; base_blend_name: string | null }>(
    `select id, title, base_blend_name from aroma_records where id = ? and user_id = ? and status = 'published'`,
    [input.aromaRecordId, viewer.userId],
  );
  if (!record) return { ok: false, reason: "not_found" };

  const settings = await readShopSettings(db);
  if (!settings.priceList.length) return { ok: false, reason: "closed" };
  const quote = quoteOrder(settings, input.volumeMl, input.quantity);
  if (!quote) return { ok: false, reason: "invalid" };

  const allowed =
    (input.paymentMethod === "online" && settings.acceptOnline && options.onlineAvailable) ||
    (input.paymentMethod === "bank" && settings.acceptBank) ||
    (input.paymentMethod === "store" && settings.acceptStore);
  if (!allowed) return { ok: false, reason: "method" };

  const contact = await readOwnContact(db, viewer);
  if (!contact.consentObtainedAt || !isShippable(contact)) return { ok: false, reason: "no_address" };
  const profile = await db.first<{ name: string }>("select name from profiles where user_id = ?", [viewer.userId]);

  const id = crypto.randomUUID();
  const now = options.now ?? new Date();
  // 注文番号がまれに重なったときは作り直す
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const orderNumber = makeOrderNumber(now, options.random);
    try {
      await db.run(
        `insert into orders (id, order_number, user_id, aroma_record_id, aroma_title, base_blend_name, volume_ml, quantity,
           unit_price, shipping_fee, total, payment_method, ship_name, ship_postal_code, ship_address1, ship_address2,
           ship_phone, customer_note)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          orderNumber,
          viewer.userId,
          record.id,
          record.title,
          record.base_blend_name ?? "",
          input.volumeMl,
          input.quantity,
          quote.unitPrice,
          quote.shippingFee,
          quote.total,
          input.paymentMethod,
          contact.shipName || profile?.name || "",
          contact.postalCode,
          contact.address1,
          contact.address2,
          contact.phone,
          input.customerNote.slice(0, 500),
        ],
      );
      const order = await findOwnOrder(db, viewer, id);
      if (order) return { ok: true, order, quote, email: contact.email };
    } catch (error) {
      if (!String(error).includes("UNIQUE") || attempt === 2) throw error;
    }
  }
  throw new Error("注文番号を決められませんでした");
}

/** 決済サービスの支払いページを作ったら、その ID を残す。 */
export async function setPaymentRef(db: QueryRunner, orderId: string, ref: string): Promise<void> {
  await db.run("update orders set payment_ref = ?, updated_at = datetime('now') where id = ?", [ref, orderId]);
}

/** 支払いページを作れなかった注文を取り消す（お客様の一覧に宙に浮いた注文を残さない）。 */
export async function cancelUnpaidOrder(db: QueryRunner, orderId: string): Promise<void> {
  await db.run(
    "update orders set status = 'cancelled', updated_at = datetime('now') where id = ? and payment_status = 'unpaid'",
    [orderId],
  );
}

/**
 * 決済サービスから「支払い済み」の知らせが来たときに呼ぶ。署名を確かめてから使うこと。
 * 支払いページの ID が注文に残したものと合うときだけ書き換える。
 */
export async function markOrderPaid(db: QueryRunner, orderId: string, paymentRef: string): Promise<boolean> {
  const row = await db.first<{ id: string }>("select id from orders where id = ? and payment_ref = ?", [orderId, paymentRef]);
  if (!row) return false;
  await db.run(
    `update orders set payment_status = 'paid', paid_at = coalesce(paid_at, datetime('now')), updated_at = datetime('now')
      where id = ?`,
    [orderId],
  );
  return true;
}
