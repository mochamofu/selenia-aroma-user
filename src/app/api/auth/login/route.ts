import { requireDb } from "@/server/db/context";
import { login } from "@/server/auth/login";
import { buildSessionCookie } from "@/server/auth/session";
import { isSecureRequest } from "@/server/auth/viewer";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { loginId?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエストの形式が正しくありません" }, { status: 400 });
  }

  const loginId = typeof body.loginId === "string" ? body.loginId : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!loginId || !password) {
    return Response.json({ error: "IDとパスワードを入力してください" }, { status: 400 });
  }

  let result;
  try {
    const db = await requireDb();
    result = await login(db, loginId, password, {
      userAgent: request.headers.get("user-agent") ?? "",
    });
  } catch (err) {
    // 何が起きたかを残す。原因が分からないまま500になると調べようがない。
    // 利用者へは中身を返さない(内部の作りを外へ出さないため)
    console.error("[login] 失敗:", err instanceof Error ? err.message : err);
    return Response.json({ error: "ログイン処理でエラーが発生しました" }, { status: 500 });
  }

  if (!result.ok) {
    // 「IDが無い」と「パスワードが違う」を区別して返さない。
    // 区別すると、どのIDが登録済みかを外から調べられてしまう
    const message =
      result.reason === "locked"
        ? "ログインの試行が続いたため、しばらく受け付けられません。時間をおいてお試しください。"
        : "IDまたはパスワードが違います";
    return Response.json({ error: message }, { status: 401 });
  }

  return Response.json(
    { ok: true, role: result.role },
    { headers: { "Set-Cookie": buildSessionCookie(result.token, isSecureRequest(request)) } },
  );
}
