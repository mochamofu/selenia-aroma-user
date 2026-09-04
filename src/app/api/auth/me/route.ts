import { getViewer } from "@/server/auth/viewer";
import { getDb } from "@/server/db/context";
import { listProfiles } from "@/server/db/repositories";

/**
 * いまログインしているのが誰かを返す。画面はこれを見て表示を決める。
 * 返す内容はセッションから決めた本人の情報だけで、他人の情報は含めない。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await getViewer(request);
  if (viewer.role === "guest") {
    return Response.json({ authenticated: false, role: "guest", profile: null });
  }

  const db = await getDb();
  // buildProfileScope により、顧客には自分の1件しか返らない
  const rows = db ? await listProfiles(db, viewer) : [];
  const profile = rows.find((r) => (r as { user_id?: string }).user_id === viewer.userId) ?? null;

  return Response.json({
    authenticated: true,
    role: viewer.role,
    storeId: viewer.role === "operator" ? viewer.storeId : null,
    profile,
  });
}
