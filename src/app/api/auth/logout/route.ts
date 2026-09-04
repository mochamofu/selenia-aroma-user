import { getDb } from "@/server/db/context";
import { buildClearCookie, destroySession, readSessionToken } from "@/server/auth/session";
import { isSecureRequest } from "@/server/auth/viewer";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = await getDb();
  const token = readSessionToken(request.headers.get("cookie"));
  // DB側のセッションも消す。Cookieを消すだけだと、控えられたtokenで戻れてしまう
  if (db && token) await destroySession(db, token);

  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": buildClearCookie(isSecureRequest(request)) } },
  );
}
