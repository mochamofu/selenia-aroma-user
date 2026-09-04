/**
 * パスワードの伸長(PBKDF2)が、本番のCloudflare Workers で実際に完走するかを試す口。
 *
 * なぜ必要か:
 *   繰り返し回数を21万回から1万回へ下げたが、その根拠(CPU上限に当たっていた)は
 *   推測のままだった。推測で戻すのではなく、本番で実際に走らせて決める。
 *
 * なぜ「時間の計測」ではなく「完走するかどうか」なのか:
 *   Workers は I/O がない間 Date.now() が進まない(タイミング攻撃対策)。
 *   計算だけを挟んでも 0ms としか出ないため、時間は測れない。
 *   代わりに、CPU上限を超えた場合はリクエストごと打ち切られる性質を使う。
 *   200 が返れば「その回数は本番で通る」、返らなければ「通らない」と分かる。
 *
 * 秘密情報は扱わない。固定の文字列を伸長しているだけ。
 *
 * 使い方:
 *   /api/health/pbkdf2?iterations=210000
 */
export const dynamic = "force-dynamic";

const DEFAULT_ITERATIONS = 210_000;
const MIN_ITERATIONS = 1_000;
const MAX_ITERATIONS = 600_000;

export async function GET(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get("iterations"));
  const iterations = Number.isInteger(requested)
    ? Math.min(Math.max(requested, MIN_ITERATIONS), MAX_ITERATIONS)
    : DEFAULT_ITERATIONS;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("benchmark-not-a-real-password"),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new Uint8Array(16), iterations, hash: "SHA-256" },
    key,
    256,
  );

  // ここへ到達できた = その回数は本番のCPU上限に収まっている
  return Response.json({ iterations, completed: true });
}
