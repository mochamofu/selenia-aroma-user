"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CustomerShell } from "@/components/customer/CustomerShell";
import { Icon } from "@/components/Icon";
import { ErrorState, LoadingState } from "@/components/States";
import { useAuth } from "@/hooks/useAuth";
import { formatOrderDate, type OwnOrder } from "@/hooks/useOwnOrders";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, yen, type OrderStatus } from "@/lib/shop";

/**
 * 注文の1件。注文した直後（?new=1）と、お支払いから戻った直後（?paid=1）は、そのことを先に伝える。
 * オンライン決済の「お支払い済み」は、Stripe からの知らせで少し遅れて付くので、数回読み直す。
 */

const STEPS: OrderStatus[] = ["requested", "making", "shipped"];

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { session } = useAuth("customer");
  const [order, setOrder] = useState<OwnOrder | null>(null);
  const [bankTransferNote, setBankTransferNote] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [arrival, setArrival] = useState<"new" | "paid" | null>(null);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const next = search.get("paid") ? "paid" : search.get("new") ? "new" : null;
    if (next) Promise.resolve().then(() => setArrival(next));
  }, []);

  useEffect(() => {
    if (!session?.userId) return;
    let alive = true;
    let tries = 0;
    const load = async () => {
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(params.id)}`, { cache: "no-store", credentials: "same-origin" });
        const body = (await response.json().catch(() => ({}))) as { order?: OwnOrder; bankTransferNote?: string; error?: string };
        if (!alive) return;
        if (!response.ok || !body.order) {
          setError(body.error ?? "注文が見つかりません");
        } else {
          setOrder(body.order);
          setBankTransferNote(body.bankTransferNote ?? "");
          // お支払いから戻ったのにまだ反映されていなければ、少し待って読み直す
          const waiting = new URLSearchParams(window.location.search).get("paid") && body.order.paymentStatus === "unpaid";
          if (waiting && tries < 5) {
            tries += 1;
            setTimeout(() => void load(), 2000);
          }
        }
      } catch {
        if (alive) setError("通信できませんでした");
      } finally {
        if (alive) setLoaded(true);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [params.id, session?.userId]);

  return (
    <CustomerShell>
      <div className="space-y-5 px-5 py-6">
        <header className="flex items-center gap-3">
          <Link href="/orders" className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-md" aria-label="ご注文の履歴へ">
            <Icon name="ArrowLeft" className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-bold text-stone-900">ご注文の内容</h1>
        </header>

        {!loaded ? (
          <LoadingState />
        ) : error || !order ? (
          <ErrorState message={error || "注文が見つかりません"} />
        ) : (
          <>
            {arrival ? (
              <section className="rounded-[28px] bg-white p-6 text-center shadow-lg shadow-stone-300/20">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#eef4e9] text-[#5e7d56]">
                  <Icon name="Check" className="h-7 w-7" />
                </div>
                <h2 className="mt-4 text-lg font-bold text-stone-900">
                  {arrival === "paid" ? "お支払いありがとうございます" : "ご注文を受け付けました"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                  {arrival === "paid" && order.paymentStatus === "unpaid"
                    ? "お支払いの確認をしています。しばらくすると「お支払い済み」に変わります。"
                    : "サロンでお作りして、お届けします。"}
                </p>
              </section>
            ) : null}

            <section className="rounded-[28px] bg-white p-5 shadow-lg shadow-stone-300/20">
              <p className="text-xs font-bold text-stone-500">
                注文番号 {order.orderNumber}・{formatOrderDate(order.createdAt)}
              </p>
              <h2 className="mt-1 text-lg font-bold text-stone-900">{order.aromaTitle}</h2>
              <ol className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-bold">
                {STEPS.map((step, index) => {
                  const reached = order.status !== "cancelled" && STEPS.indexOf(order.status) >= index;
                  return (
                    <li key={step} className={`rounded-2xl px-2 py-3 ${reached ? "bg-[#efe8fb] text-[#755aa8]" : "bg-stone-100 text-stone-400"}`}>
                      {["受付", "お作りしています", "発送"][index]}
                    </li>
                  );
                })}
              </ol>
              <p className="mt-3 text-sm font-bold text-stone-700">{ORDER_STATUS_LABELS[order.status]}</p>
              {order.trackingNumber ? (
                <p className="mt-1 text-sm text-stone-600">送り状番号：{order.trackingNumber}</p>
              ) : null}
            </section>

            <section className="rounded-[28px] bg-white p-5 shadow-lg shadow-stone-300/20">
              <dl className="space-y-2 text-sm text-stone-600">
                <div className="flex justify-between">
                  <dt>
                    {order.volumeMl}mL × {order.quantity}本
                  </dt>
                  <dd className="tabular-nums">{yen(order.unitPrice * order.quantity)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>送料</dt>
                  <dd className="tabular-nums">{order.shippingFee === 0 ? "無料" : yen(order.shippingFee)}</dd>
                </div>
                <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-bold text-stone-900">
                  <dt>合計（税込）</dt>
                  <dd className="tabular-nums">{yen(order.total)}</dd>
                </div>
                <div className="flex justify-between pt-1">
                  <dt>お支払い</dt>
                  <dd className="font-bold text-stone-800">
                    {PAYMENT_METHOD_LABELS[order.paymentMethod]}・{PAYMENT_STATUS_LABELS[order.paymentStatus]}
                  </dd>
                </div>
              </dl>
              {order.paymentMethod === "bank" && order.paymentStatus === "unpaid" && bankTransferNote ? (
                <div className="mt-4 rounded-2xl bg-[#faf7f1] p-4">
                  <p className="text-xs font-bold text-stone-500">お振込先</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-800">{bankTransferNote}</p>
                  <p className="mt-2 text-xs text-stone-500">お振込の名義の前に、注文番号の下4桁を入れていただけると確認が早くなります。</p>
                </div>
              ) : null}
            </section>

            {order.aromaRecordId ? (
              <Link href={`/aromas/${order.aromaRecordId}`} className="block text-center text-sm font-bold text-[#755aa8]">
                この香りの記録を見る
              </Link>
            ) : null}
          </>
        )}
      </div>
    </CustomerShell>
  );
}
