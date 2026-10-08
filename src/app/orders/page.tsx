"use client";

import Link from "next/link";
import { CustomerShell } from "@/components/customer/CustomerShell";
import { Icon } from "@/components/Icon";
import { LoadingState } from "@/components/States";
import { useAuth } from "@/hooks/useAuth";
import { formatOrderDate, useOwnOrders } from "@/hooks/useOwnOrders";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, yen } from "@/lib/shop";

/** ご注文の履歴。自分の注文だけが並ぶ。 */
export default function OrdersPage() {
  const { session } = useAuth("customer");
  const orders = useOwnOrders(session?.userId);

  return (
    <CustomerShell>
      <div className="space-y-5 px-5 py-6">
        <header className="flex items-center gap-3">
          <Link href="/profile" className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-md" aria-label="戻る">
            <Icon name="ArrowLeft" className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-bold text-stone-900">ご注文の履歴</h1>
        </header>
        {orders === null ? (
          <LoadingState />
        ) : orders.length === 0 ? (
          <section className="rounded-[28px] bg-white p-6 text-center text-sm leading-7 text-stone-500 shadow-lg shadow-stone-300/20">
            まだご注文はありません。
            <br />
            コレクションの香りから「再購入する」でご注文いただけます。
          </section>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="block rounded-[24px] bg-white p-4 shadow-lg shadow-stone-300/20 transition active:scale-[0.99]"
              >
                <span className="flex items-center justify-between gap-2 text-xs font-bold text-stone-500">
                  <span>{formatOrderDate(order.createdAt)}</span>
                  <span className={order.status === "shipped" ? "text-[#5e7d56]" : "text-[#755aa8]"}>
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                </span>
                <span className="mt-1 block truncate text-base font-bold text-stone-900">{order.aromaTitle}</span>
                <span className="mt-1 block text-xs text-stone-500">
                  {order.volumeMl}mL × {order.quantity}本・{yen(order.total)}・{PAYMENT_STATUS_LABELS[order.paymentStatus]}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </CustomerShell>
  );
}
