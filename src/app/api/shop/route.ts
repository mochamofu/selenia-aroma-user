import { getViewer } from "@/server/auth/viewer";
import { getDb } from "@/server/db/context";
import { readShopSettings } from "@/server/db/shopRepository";
import { readStripeKeys } from "@/server/payments/config";

/**
 * 再注文の受付状況（価格表・送料・選べる支払い方法）。
 * 注文の知らせを受け取るメールアドレスなど、お客様に関係のない設定は返さない。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await getViewer(request);
  if (viewer.role === "guest") return Response.json({ error: "ログインしてください" }, { status: 401 });
  const db = await getDb();
  if (!db) return Response.json({ open: false, priceList: [], methods: [] });

  const settings = await readShopSettings(db);
  const online = settings.acceptOnline && Boolean(await readStripeKeys());
  const methods = [
    ...(online ? ["online"] : []),
    ...(settings.acceptBank ? ["bank"] : []),
    ...(settings.acceptStore ? ["store"] : []),
  ];
  return Response.json({
    open: settings.priceList.length > 0 && methods.length > 0,
    priceList: settings.priceList,
    shippingFee: settings.shippingFee,
    freeShippingOver: settings.freeShippingOver,
    methods,
    bankTransferNote: settings.bankTransferNote,
  });
}
