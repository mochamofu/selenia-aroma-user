import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createCheckoutSession, paidOrderFromEvent, signPayload, toFormBody, verifyWebhookSignature } from "./stripe.ts";

describe("Stripe の支払いページ", () => {
  const request = {
    orderId: "order-1",
    orderNumber: "SA-261008-ABCD",
    lines: [
      { name: "オーダーアロマ 5mL", unitAmount: 3300, quantity: 2 },
      { name: "送料", unitAmount: 500, quantity: 1 },
    ],
    successUrl: "https://example.test/orders/order-1?paid=1",
    cancelUrl: "https://example.test/orders/order-1",
  };

  test("金額は円のまま、注文の ID を添えて送る", () => {
    const form = toFormBody(request);
    assert.equal(form.get("line_items[0][price_data][currency]"), "jpy");
    assert.equal(form.get("line_items[0][price_data][unit_amount]"), "3300");
    assert.equal(form.get("line_items[0][quantity]"), "2");
    assert.equal(form.get("metadata[order_id]"), "order-1");
    // 支払い方法は Stripe の管理画面で決めるので、ここでは送らない
    assert.equal([...form.keys()].some((key) => key.startsWith("payment_method_types")), false);
  });

  test("うまくいけば URL を返し、失敗すれば例外にする", async () => {
    const ok = (async () => new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.test/cs_1" }))) as typeof fetch;
    assert.deepEqual(await createCheckoutSession("sk_test", request, ok), { id: "cs_1", url: "https://checkout.test/cs_1" });
    const ng = (async () => new Response(JSON.stringify({ error: { message: "bad" } }), { status: 400 })) as typeof fetch;
    await assert.rejects(createCheckoutSession("sk_test", request, ng), /bad/);
  });
});

describe("Stripe からの知らせ", () => {
  const secret = "whsec_test";
  const payload = JSON.stringify({ type: "checkout.session.completed" });

  test("正しい署名なら受け、違う署名・古い時刻は受けない", async () => {
    const now = 1_800_000_000;
    const signature = await signPayload(secret, String(now), payload);
    assert.equal(await verifyWebhookSignature(payload, `t=${now},v1=${signature}`, secret, now), true);
    assert.equal(await verifyWebhookSignature(payload, `t=${now},v1=${"0".repeat(64)}`, secret, now), false);
    assert.equal(await verifyWebhookSignature(`${payload} `, `t=${now},v1=${signature}`, secret, now), false);
    assert.equal(await verifyWebhookSignature(payload, `t=${now},v1=${signature}`, secret, now + 600), false);
    assert.equal(await verifyWebhookSignature(payload, null, secret, now), false);
  });

  test("支払い済みの知らせだけを拾う", () => {
    const event = (type: string, status: string) => ({
      type,
      data: { object: { id: "cs_1", payment_status: status, metadata: { order_id: "order-1" } } },
    });
    assert.deepEqual(paidOrderFromEvent(event("checkout.session.completed", "paid")), { orderId: "order-1", sessionId: "cs_1" });
    assert.equal(paidOrderFromEvent(event("checkout.session.completed", "unpaid")), null);
    assert.deepEqual(paidOrderFromEvent(event("checkout.session.async_payment_succeeded", "paid"))?.orderId, "order-1");
    assert.equal(paidOrderFromEvent(event("payment_intent.created", "paid")), null);
  });
});
