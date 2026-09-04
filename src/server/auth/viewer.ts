import "server-only";

import { getDb } from "../db/context.ts";
import type { Viewer } from "../db/access.ts";
import { findSession, readSessionToken, toViewer, touchSession } from "./session.ts";

/**
 * リクエストから「いま誰が見ているか」を決める、唯一の入口。
 *
 * APIルートはこれだけを使い、リクエストの本文やクエリからユーザーIDを
 * 受け取らない。受け取ってしまうと、他人のIDを送るだけで他人のカルテが
 * 読めてしまう。D1にはRLSが無いため、この一点が最後の防壁になる。
 *
 * セッションが無い・切れている場合は guest を返す。guest は
 * src/server/db/access.ts の絞り込みで1件も返さないようになっている。
 */
export async function getViewer(request: Request): Promise<Viewer> {
  const db = await getDb();
  if (!db) return { role: "guest" };

  const token = readSessionToken(request.headers.get("cookie"));
  if (!token) return { role: "guest" };

  const session = await findSession(db, token);
  if (!session) return { role: "guest" };

  await touchSession(db, session);
  return toViewer(session);
}

/** 本番かどうか。Cookieに Secure を付けるかの判定に使う。 */
export function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}
