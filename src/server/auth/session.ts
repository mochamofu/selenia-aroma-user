import type { QueryRunner } from "../db/runner.ts";
import type { Viewer } from "../db/access.ts";

/**
 * セッションの発行と検証。
 *
 * ブラウザには token をそのまま渡し、DBには token の SHA-256 だけを保存する。
 * こうしておくと、万一DBの中身が漏れても、そこからログイン状態を作れない。
 * (逆に token をそのまま保存すると、DBが漏れた時点で全員になりすませる)
 */

/** Cookieの名前。 */
export const SESSION_COOKIE = "selenia_session";

/** セッションの有効期間。1日に1回来店する使い方を想定して14日。 */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

/** この時間より古い最終アクセスなら、有効期限を延ばす。毎回書き込まないため。 */
const RENEW_AFTER_SECONDS = 60 * 60;

export type SessionRow = {
  id: string;
  user_id: string;
  store_id: string | null;
  expires_at: string;
  last_seen_at: string;
  role: string;
};

function nowIso(offsetSeconds = 0): string {
  return new Date(Date.now() + offsetSeconds * 1000).toISOString().replace("T", " ").slice(0, 19);
}

/** 推測できない token を作る。32バイトの乱数を16進で表す。 */
export function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** token から、DBに保存する側の値を作る。元には戻せない。 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(
  db: QueryRunner,
  params: { userId: string; storeId?: string | null; userAgent?: string },
): Promise<{ token: string; expiresAt: string }> {
  const token = createSessionToken();
  const tokenHash = await hashToken(token);
  const expiresAt = nowIso(SESSION_TTL_SECONDS);
  await db.run(
    `insert into sessions (id, user_id, token_hash, store_id, expires_at, user_agent)
     values (?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), params.userId, tokenHash, params.storeId ?? null, expiresAt, (params.userAgent ?? "").slice(0, 200)],
  );
  return { token, expiresAt };
}

/**
 * Cookieの token から、いま誰が見ているかを決める。
 *
 * 期限切れは返さない。役割(role)はセッションではなく profiles から都度読む。
 * 権限を落としたときに、発行済みのセッションが古い権限のまま生き残らない
 * ようにするため。
 */
export async function findSession(db: QueryRunner, token: string): Promise<SessionRow | null> {
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const row = await db.first<SessionRow>(
    `select s.id, s.user_id, s.store_id, s.expires_at, s.last_seen_at, p.role
       from sessions s
       join profiles p on p.user_id = s.user_id
      where s.token_hash = ? and s.expires_at > datetime('now')`,
    [tokenHash],
  );
  return row ?? null;
}

/** 使われ続けている間は期限を延ばす。毎回書くと書き込みが増えるので間引く。 */
export async function touchSession(db: QueryRunner, session: SessionRow): Promise<void> {
  const lastSeen = Date.parse(session.last_seen_at.replace(" ", "T") + "Z");
  if (Number.isFinite(lastSeen) && Date.now() - lastSeen < RENEW_AFTER_SECONDS * 1000) return;
  await db.run(
    `update sessions set last_seen_at = datetime('now'), expires_at = ? where id = ?`,
    [nowIso(SESSION_TTL_SECONDS), session.id],
  );
}

export async function destroySession(db: QueryRunner, token: string): Promise<void> {
  if (!token) return;
  await db.run(`delete from sessions where token_hash = ?`, [await hashToken(token)]);
}

/** 期限切れの掃除。ログインのたびに少しずつ消す。 */
export async function deleteExpiredSessions(db: QueryRunner): Promise<void> {
  await db.run(`delete from sessions where expires_at <= datetime('now')`, []);
}

/**
 * セッションの行から Viewer を作る。
 *
 * ここが「画面から渡された値を信じない」ことの実体。Viewer の userId は
 * 必ずセッション由来で、リクエストの本文やクエリからは決して作らない。
 */
export function toViewer(session: SessionRow | null): Viewer {
  if (!session) return { role: "guest" };
  if (session.role === "admin") return { role: "admin", userId: session.user_id };
  if (session.role === "operator") {
    // 店舗が決まっていない施術者は、顧客一覧を引けない状態にしておく。
    // 空文字はどの店舗にも一致しないため、結果は0件になる。
    return { role: "operator", userId: session.user_id, storeId: session.store_id ?? "" };
  }
  return { role: "customer", userId: session.user_id };
}

/** Set-Cookie に入れる値。HttpOnly なので画面のJavaScriptからは読めない。 */
export function buildSessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Cookieヘッダから token を取り出す。 */
export function readSessionToken(cookieHeader: string | null): string {
  if (!cookieHeader) return "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=");
  }
  return "";
}
