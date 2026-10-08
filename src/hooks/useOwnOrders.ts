"use client";

import { useEffect, useState } from "react";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "@/lib/shop";

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

/** 自分の注文の一覧。ログインが済むまでは読まない。 */
export function useOwnOrders(userId?: string) {
  const [orders, setOrders] = useState<OwnOrder[] | null>(null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetch("/api/orders", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => (response.ok ? ((await response.json()) as { orders: OwnOrder[] }).orders : []))
      .catch(() => [] as OwnOrder[])
      .then((loaded) => alive && setOrders(loaded));
    return () => {
      alive = false;
    };
  }, [userId]);
  return orders;
}

/** D1 の日時（UTC）を、日本時間の「10月8日」にする。 */
export function formatOrderDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime())
    ? value.slice(0, 10)
    : date.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric" });
}
