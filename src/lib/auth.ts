"use client";

import type { Profile, UserRole } from "@/types/profile";

/**
 * 画面側の認証。
 *
 * ここには「誰がログインしているか」の判断を一切置かない。判断はサーバが行い、
 * 画面はその結果を受け取るだけにする。以前は端末内(localStorage)に
 * ログイン状態を持っていたが、それだと利用者が自分で書き換えられてしまう。
 *
 * セッションはHttpOnlyのCookieでやり取りするため、この画面のコードからは
 * token を読むことも書くこともできない。それが狙い。
 */

export type AuthSession = {
  userId: string;
  role: UserRole;
};

export type MeResponse = {
  authenticated: boolean;
  role: UserRole | "guest";
  storeId?: string | null;
  profile: Profile | null;
};

export class LoginError extends Error {}

/** いまログインしているのが誰かをサーバに尋ねる。 */
export async function fetchMe(): Promise<MeResponse> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return { authenticated: false, role: "guest", profile: null };
    return (await res.json()) as MeResponse;
  } catch {
    return { authenticated: false, role: "guest", profile: null };
  }
}

export async function signInWithEmail(loginId: string, password: string): Promise<{ role: UserRole }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ loginId, password }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new LoginError(body.error ?? "ログインに失敗しました");
  }

  return (await res.json()) as { role: UserRole };
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
}
