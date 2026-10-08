/**
 * Stripe（オンライン決済）とのやりとり。カード・PayPay・Apple Pay などは Stripe の
 * 支払いページ（Checkout）で受ける。カード番号はこのアプリを通らない。
 *
 * どの支払い方法を出すかは Stripe の管理画面で決める（ここでは指定しない）。
 * PayPay を有効にすれば、コードを変えずに支払いページに出る。
 *
 * キーは Cloudflare の設定（Secrets）に入れる。リポジトリやチャットに書かない。
 *   STRIPE_SECRET_KEY      sk_live_... / sk_test_...
 *   STRIPE_WEBHOOK_SECRET  whsec_...（支払い完了の知らせが本物かを確かめる）
 *
 * テスト（node --test）から読めるよう、ほかのファイルに頼らない。
 */

const API = "https://api.stripe.com/v1";

export type CheckoutLine = { name: string; unitAmount: number; quantity: number };

export type CheckoutRequest = {
  orderId: string;
  orderNumber: string;
  lines: CheckoutLine[];
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
};

/** Stripe の API は application/x-www-form-urlencoded で、入れ子は a[0][b] の形で送る。 */
export function toFormBody(request: CheckoutRequest): URLSearchParams {
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("client_reference_id", request.orderId);
  form.set("metadata[order_id]", request.orderId);
  form.set("metadata[order_number]", request.orderNumber);
  form.set("payment_intent_data[metadata][order_id]", request.orderId);
  form.set("success_url", request.successUrl);
  form.set("cancel_url", request.cancelUrl);
  form.set("locale", "ja");
  if (request.customerEmail) form.set("customer_email", request.customerEmail);
  request.lines.forEach((line, index) => {
    form.set(`line_items[${index}][quantity]`, String(line.quantity));
    form.set(`line_items[${index}][price_data][currency]`, "jpy");
    form.set(`line_items[${index}][price_data][unit_amount]`, String(line.unitAmount));
    form.set(`line_items[${index}][price_data][product_data][name]`, line.name);
  });
  return form;
}

/** 支払いページを作り、その URL を返す。 */
export async function createCheckoutSession(
  secretKey: string,
  request: CheckoutRequest,
  fetcher: typeof fetch = fetch,
): Promise<{ id: string; url: string }> {
  const response = await fetcher(`${API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // 同じ注文で二重に支払いページを作らない
      "Idempotency-Key": `checkout-${request.orderId}`,
    },
    body: toFormBody(request),
  });
  const body = (await response.json().catch(() => ({}))) as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !body.id || !body.url) {
    throw new Error(`Stripe: ${body.error?.message ?? response.status}`);
  }
  return { id: body.id, url: body.url };
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 長さの違いや途中の一致で時間が変わらない比較。 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signPayload(secret: string, timestamp: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`)));
}

/**
 * Stripe からの知らせ（Webhook）が本物かを確かめる。
 * Stripe-Signature: t=時刻,v1=署名 。時刻が5分以上ずれていたら受けない（使い回しを防ぐ）。
 */
export async function verifyWebhookSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(",").map((part) => part.trim().split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1] ?? "";
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value ?? "");
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(nowSec - Number(timestamp)) > toleranceSec) return false;
  const expected = await signPayload(secret, timestamp, payload);
  return signatures.some((signature) => safeEqual(signature, expected));
}

/** 支払いが済んだことを表す知らせか。済んでいれば注文の ID と Stripe 側の ID を返す。 */
export function paidOrderFromEvent(event: unknown): { orderId: string; sessionId: string } | null {
  const value = event as {
    type?: string;
    data?: { object?: { id?: string; payment_status?: string; client_reference_id?: string; metadata?: { order_id?: string } } };
  };
  if (value?.type !== "checkout.session.completed" && value?.type !== "checkout.session.async_payment_succeeded") {
    return null;
  }
  const session = value.data?.object;
  if (!session?.id || session.payment_status !== "paid") return null;
  const orderId = session.metadata?.order_id ?? session.client_reference_id ?? "";
  return orderId ? { orderId, sessionId: session.id } : null;
}
