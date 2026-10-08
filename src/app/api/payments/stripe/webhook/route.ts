import { getDb } from "@/server/db/context";
import { markOrderPaid } from "@/server/db/shopRepository";
import { readStripeKeys } from "@/server/payments/config";
import { paidOrderFromEvent, verifyWebhookSignature } from "@/server/payments/stripe";

/**
 * Stripe からの「支払いが済んだ」知らせ。Stripe の管理画面で、この URL を Webhook の送り先に登録する。
 *   https://<お客様用アプリ>/api/payments/stripe/webhook
 *   イベント: checkout.session.completed, checkout.session.async_payment_succeeded
 *
 * 署名を確かめてから使う。確かめられないものは何もしない。
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const keys = await readStripeKeys();
  if (!keys?.webhookSecret) return Response.json({ error: "not_configured" }, { status: 503 });

  const payload = await request.text();
  if (!(await verifyWebhookSignature(payload, request.headers.get("stripe-signature"), keys.webhookSecret))) {
    return Response.json({ error: "invalid_signature" }, { status: 400 });
  }

  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return Response.json({ error: "invalid_payload" }, { status: 400 });
  }
  const paid = paidOrderFromEvent(event);
  if (paid) {
    const db = await getDb();
    if (!db) return Response.json({ error: "database_unavailable" }, { status: 503 });
    await markOrderPaid(db, paid.orderId, paid.sessionId);
  }
  // 関係のない種類の知らせにも 200 を返す（返さないと Stripe が送り直し続ける）
  return Response.json({ received: true });
}
