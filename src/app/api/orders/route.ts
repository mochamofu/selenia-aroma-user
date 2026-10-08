import { getViewer } from "@/server/auth/viewer";
import { getDb } from "@/server/db/context";
import {
  cancelUnpaidOrder,
  createOrder,
  listOwnOrders,
  setPaymentRef,
  type CreateOrderResult,
} from "@/server/db/shopRepository";
import { createCheckoutSession } from "@/server/payments/stripe";
import { readStripeKeys } from "@/server/payments/config";
import { isPaymentMethod } from "@/lib/shop";

/**
 * 自分の注文。GET で一覧、POST で再注文する。
 *
 * 金額は価格表からサーバーで出し直す。画面から送られた金額は使わない。
 * オンライン決済のときは、Stripe の支払いページの URL（checkoutUrl）を返す。
 */
export const dynamic = "force-dynamic";

const REASONS: Record<Exclude<CreateOrderResult, { ok: true }>["reason"], [number, string]> = {
  not_found: [404, "この香りは再注文できません"],
  closed: [409, "ただいま再注文を受け付けていません"],
  invalid: [400, "容量か本数を選び直してください"],
  method: [400, "このお支払い方法はいま選べません"],
  no_address: [409, "お届け先を入れてください"],
};

export async function GET(request: Request) {
  const viewer = await getViewer(request);
  if (viewer.role !== "customer") return Response.json({ error: "ログインしてください" }, { status: 401 });
  const db = await getDb();
  if (!db) return Response.json({ orders: [] });
  return Response.json({ orders: await listOwnOrders(db, viewer) });
}

export async function POST(request: Request) {
  const viewer = await getViewer(request);
  if (viewer.role !== "customer") return Response.json({ error: "ログインしてください" }, { status: 401 });
  const db = await getDb();
  if (!db) return Response.json({ error: "データベースに接続できません" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const paymentMethod = body.paymentMethod;
  if (typeof body.aromaRecordId !== "string" || !isPaymentMethod(paymentMethod)) {
    return Response.json({ error: "注文の内容を確かめてください" }, { status: 400 });
  }
  const stripe = await readStripeKeys();
  const result = await createOrder(
    db,
    viewer,
    {
      aromaRecordId: body.aromaRecordId,
      volumeMl: Number(body.volumeMl),
      quantity: Number(body.quantity),
      paymentMethod,
      customerNote: typeof body.customerNote === "string" ? body.customerNote.trim() : "",
    },
    { onlineAvailable: Boolean(stripe) },
  );
  if (!result.ok) {
    const [status, error] = REASONS[result.reason];
    return Response.json({ error }, { status });
  }

  const { order, quote } = result;
  if (order.paymentMethod !== "online" || !stripe) {
    return Response.json({ order });
  }

  const origin = new URL(request.url).origin;
  try {
    const session = await createCheckoutSession(stripe.secretKey, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      lines: [
        { name: `オーダーアロマ「${order.aromaTitle}」${order.volumeMl}mL`, unitAmount: quote.unitPrice, quantity: order.quantity },
        ...(quote.shippingFee > 0 ? [{ name: "送料", unitAmount: quote.shippingFee, quantity: 1 }] : []),
      ],
      customerEmail: result.email || undefined,
      successUrl: `${origin}/orders/${order.id}?paid=1`,
      cancelUrl: `${origin}/aromas/${order.aromaRecordId}/reorder`,
    });
    await setPaymentRef(db, order.id, session.id);
    return Response.json({ order, checkoutUrl: session.url });
  } catch (error) {
    console.error("[orders] 支払いページを作れませんでした", error);
    await cancelUnpaidOrder(db, order.id);
    return Response.json(
      { error: "お支払いページを開けませんでした。時間をおくか、ほかのお支払い方法を選んでください" },
      { status: 502 },
    );
  }
}
