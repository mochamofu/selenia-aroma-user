import type { QueryRunner } from "../db/runner.ts";
import { hashPassword, needsRehash, verifyPassword } from "./password.ts";
import { createSession, deleteExpiredSessions } from "./session.ts";

/**
 * ログインの判定。
 *
 * 気をつけていること:
 *   1. 「IDが無い」と「パスワードが違う」を区別して返さない。区別すると、
 *      どのIDが登録済みかを外から調べられてしまう
 *   2. IDが無い場合もパスワードの計算を行う。応答時間の差から存在を
 *      推測されないようにするため
 *   3. 連続して失敗したら一定時間受け付けない。総当たりを遅くする
 */

/** 何回続けて失敗したらロックするか。 */
export const MAX_FAILED_ATTEMPTS = 10;
/** ロックする時間(分)。 */
export const LOCK_MINUTES = 15;

/** 存在しないIDでも同じだけ計算するためのダミー。実在の値ではない。 */
const DUMMY_HASH = "pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export type LoginResult =
  | { ok: true; token: string; userId: string; role: string }
  | { ok: false; reason: "invalid" | "locked" };

type CredentialRow = {
  user_id: string;
  password_hash: string;
  failed_attempts: number;
  locked_until: string | null;
  role: string;
  store_id: string | null;
};

export async function login(
  db: QueryRunner,
  loginId: string,
  password: string,
  options: { userAgent?: string } = {},
): Promise<LoginResult> {
  const normalized = loginId.trim().toLowerCase();

  const row = await db.first<CredentialRow>(
    `select c.user_id, c.password_hash, c.failed_attempts, c.locked_until,
            p.role, p.store_id
       from credentials c
       join profiles p on p.user_id = c.user_id
      where c.login_id = ?`,
    [normalized],
  );

  if (row?.locked_until) {
    const locked = await db.first<{ still: number }>(
      `select case when ? > datetime('now') then 1 else 0 end as still`,
      [row.locked_until],
    );
    if (locked?.still) return { ok: false, reason: "locked" };
  }

  // 見つからない場合もハッシュ計算を行う。応答時間を揃えるため
  const matched = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);

  if (!row || !matched) {
    if (row) await recordFailure(db, row.user_id, row.failed_attempts + 1);
    return { ok: false, reason: "invalid" };
  }

  // 繰り返し回数の基準を上げたあとは、ログイン時に保存し直す
  if (needsRehash(row.password_hash)) {
    await db.run(`update credentials set password_hash = ?, updated_at = datetime('now') where user_id = ?`, [
      await hashPassword(password),
      row.user_id,
    ]);
  }

  await db.run(
    `update credentials
        set failed_attempts = 0, locked_until = null,
            last_login_at = datetime('now'), updated_at = datetime('now')
      where user_id = ?`,
    [row.user_id],
  );

  await deleteExpiredSessions(db);

  const { token } = await createSession(db, {
    userId: row.user_id,
    storeId: row.role === "operator" ? row.store_id : null,
    userAgent: options.userAgent,
  });

  return { ok: true, token, userId: row.user_id, role: row.role };
}

async function recordFailure(db: QueryRunner, userId: string, attempts: number): Promise<void> {
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    await db.run(
      `update credentials
          set failed_attempts = ?, locked_until = datetime('now', ?), updated_at = datetime('now')
        where user_id = ?`,
      [attempts, `+${LOCK_MINUTES} minutes`, userId],
    );
    return;
  }
  await db.run(
    `update credentials set failed_attempts = ?, updated_at = datetime('now') where user_id = ?`,
    [attempts, userId],
  );
}

/** 資格情報の作成。運用画面ができるまでは、投入用スクリプトから使う。 */
export async function createCredential(
  db: QueryRunner,
  params: { userId: string; loginId: string; password: string },
): Promise<void> {
  await db.run(
    `insert into credentials (id, user_id, login_id, password_hash) values (?, ?, ?, ?)`,
    [crypto.randomUUID(), params.userId, params.loginId.trim().toLowerCase(), await hashPassword(params.password)],
  );
}
