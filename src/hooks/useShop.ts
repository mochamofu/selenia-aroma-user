"use client";

import { useEffect, useState } from "react";
import type { PaymentMethod, PriceItem } from "@/lib/shop";

export type ShopInfo = {
  open: boolean;
  priceList: PriceItem[];
  shippingFee: number;
  freeShippingOver: number | null;
  methods: PaymentMethod[];
  bankTransferNote: string;
};

const CLOSED: ShopInfo = { open: false, priceList: [], shippingFee: 0, freeShippingOver: null, methods: [], bankTransferNote: "" };

/** 再注文の受付状況。ログインが済むまでは読まない。 */
export function useShop(userId?: string) {
  const [shop, setShop] = useState<ShopInfo | null>(null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetch("/api/shop", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => (response.ok ? ({ ...CLOSED, ...((await response.json()) as Partial<ShopInfo>) } as ShopInfo) : CLOSED))
      .catch(() => CLOSED)
      .then((loaded) => alive && setShop(loaded));
    return () => {
      alive = false;
    };
  }, [userId]);
  return shop;
}
