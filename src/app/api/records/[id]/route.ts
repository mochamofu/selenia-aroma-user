import { getViewer } from "@/server/auth/viewer";
import { getDb } from "@/server/db/context";
import { findAromaRecord, listIngredients } from "@/server/db/repositories";

/**
 * 制作記録の1件と、その材料。
 *
 * IDを知っていても、自分のものでなければ返らない。絞り込みは
 * src/server/db/access.ts に閉じ込めてあり、ここでは書かない。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer(request);
  if (viewer.role === "guest") {
    return Response.json({ error: "ログインしてください" }, { status: 401 });
  }

  const { id } = await context.params;
  const db = await getDb();
  if (!db) return Response.json({ error: "データベースに接続できません" }, { status: 503 });

  const record = await findAromaRecord(db, viewer, id);
  // 他人の記録も、存在しない記録も、同じ404にする。
  // 区別すると「そのIDは存在する」ことが分かってしまう
  if (!record) return Response.json({ error: "記録が見つかりません" }, { status: 404 });

  return Response.json({
    source: "d1",
    record,
    ingredients: await listIngredients(db, viewer, id),
  });
}
