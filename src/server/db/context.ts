import "server-only";

import { createD1Runner, type QueryRunner } from "./runner.ts";

/**
 * 実行中のリクエストから D1 を取り出す。
 *
 * D1はCloudflare Workersのバインディングとしてしか触れない。ブラウザからは
 * 直接つながらないため、画面(クライアント)はAPIルート経由でここを呼ぶ。
 * この形にしておくと、権限の判定を必ずサーバ側で行える。
 * 画面から渡されたユーザーIDを信じてしまうと、他人のIDを送るだけで
 * 他人のカルテが読めてしまうため、ここは譲れない。
 *
 * Vercel など Workers 以外で動かしているときはバインディングが無い。
 * その場合は null を返し、呼び出し側が固定データにフォールバックする。
 * 例外にしないのは、D1へ移行し終える前でも画面が動く必要があるため。
 */

type D1Binding = Parameters<typeof createD1Runner>[0];

let warned = false;

export async function getDb(): Promise<QueryRunner | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const binding = (env as Record<string, unknown>).DB as D1Binding | undefined;
    if (!binding) return null;
    return createD1Runner(binding);
  } catch {
    // Workers 以外で動いている、またはビルド時の事前描画中。
    if (!warned) {
      warned = true;
      console.info("[db] D1のバインディングが見つかりません。固定データで動作します。");
    }
    return null;
  }
}

/** D1が必須の処理で使う。無いときは呼び出し側が503を返せるよう例外にする。 */
export async function requireDb(): Promise<QueryRunner> {
  const db = await getDb();
  if (!db) throw new Error("D1に接続できません（Cloudflare Workers上でのみ利用できます）");
  return db;
}
