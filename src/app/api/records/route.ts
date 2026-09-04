import { getViewer } from "@/server/auth/viewer";
import { getDb } from "@/server/db/context";
import { listAromaRecords } from "@/server/db/repositories";

/**
 * 制作記録の一覧。
 *
 * 誰の記録を返すかは、セッションから決めた Viewer だけで決まる。
 * リクエストからユーザーIDを受け取らない。受け取ると、他人のIDを送るだけで
 * 他人のカルテが読めてしまう。
 *
 * 顧客本人には「自分の・公開済みの」記録だけが返る（buildAromaRecordScope）。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await getViewer(request);
  if (viewer.role === "guest") {
    return Response.json({ error: "ログインしてください" }, { status: 401 });
  }

  const db = await getDb();
  if (!db) return Response.json({ source: "mock", items: [] });

  return Response.json({ source: "d1", items: await listAromaRecords(db, viewer) });
}
