"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchMe, signOut, type AuthSession } from "@/lib/auth";
import { isCustomerOnlyApp } from "@/lib/appTarget";
import type { Profile } from "@/types/profile";

/**
 * ログイン状態を画面へ渡す。
 *
 * 判断はすべてサーバが行う(/api/auth/me)。画面は結果を受け取るだけで、
 * 端末内に持っている値でログイン状態を作らない。利用者が自分で書き換えられて
 * しまうため。
 *
 * ログインしていなければ /login へ送る。読み込み中に中身を描画しないよう、
 * 呼び出し側は loading の間はデータを出さないこと。
 */
export function useAuth(requiredRole?: "customer" | "admin") {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    fetchMe().then((me) => {
      if (!alive) return;

      if (!me.authenticated || me.role === "guest") {
        setLoading(false);
        router.replace("/login");
        return;
      }

      // 購入者向けアプリでは、事業者の資格情報でログインしても顧客画面へ
      // 入れない。役割ごとに見えるものが違うため、混ぜない
      if (isCustomerOnlyApp && me.role !== "customer") {
        setLoading(false);
        signOut().then(() => router.replace("/login"));
        return;
      }

      if (requiredRole && me.role !== requiredRole) {
        setLoading(false);
        router.replace(me.role === "admin" ? "/admin" : "/dashboard");
        return;
      }

      setSession({ userId: me.profile?.user_id ?? "", role: me.role });
      setProfile(me.profile);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [requiredRole, router]);

  const logout = useCallback(async () => {
    await signOut();
    setSession(null);
    setProfile(null);
    router.replace("/login");
  }, [router]);

  return { session, profile, loading, logout };
}
