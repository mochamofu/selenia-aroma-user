import { getViewer } from "@/server/auth/viewer";
import { getDb } from "@/server/db/context";
import { findOwnOrder, readShopSettings } from "@/server/db/shopRepository";

/** 自分の注文の1件。振込のときは振込先の案内も返す。他人の注文は「見つからない」にする。 */
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer(request);
  if (viewer.role !== "customer") return Response.json({ error: "ログインしてください" }, { status: 401 });
  const db = await getDb();
  if (!db) return Response.json({ error: "データベースに接続できません" }, { status: 503 });
  const { id } = await context.params;
  const order = await findOwnOrder(db, viewer, id);
  if (!order) return Response.json({ error: "注文が見つかりません" }, { status: 404 });
  const bankTransferNote = order.paymentMethod === "bank" ? (await readShopSettings(db)).bankTransferNote : "";
  return Response.json({ order, bankTransferNote });
}
