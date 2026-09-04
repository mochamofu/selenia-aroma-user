"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { fetchMe, signInWithEmail } from "@/lib/auth";

/**
 * ログイン画面。
 *
 * 判定はすべてサーバが行う。以前はデモ表示のときこの画面を素通りして
 * ダッシュボードへ入れていたが、それだと誰でも中身を見られるため廃止した。
 * 役割の振り分けもサーバの応答に従い、入力されたIDの中身では判断しない。
 */
export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  // すでにログイン済みならログイン画面を出さずに中へ入れる
  useEffect(() => {
    let alive = true;
    fetchMe().then((me) => {
      if (!alive) return;
      if (me.authenticated) router.replace(me.role === "admin" ? "/admin" : "/dashboard");
      else setChecking(false);
    });
    return () => {
      alive = false;
    };
  }, [router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signInWithEmail(loginId, password);
      router.replace(result.role === "admin" ? "/admin" : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return <main className="grid min-h-screen place-items-center bg-[#FAF7F1] text-sm text-stone-500">読み込み中...</main>;
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[430px] place-items-center bg-[#FAF7F1] px-6">
      <form onSubmit={onSubmit} className="w-full rounded-[34px] bg-white/86 p-6 shadow-2xl shadow-stone-300/40 backdrop-blur">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-[24px] bg-gradient-to-br from-[#c6b0e6] to-[#d7c58e] text-white shadow-lg">
            <Icon name="Sparkles" className="h-8 w-8" />
          </div>
          {/*
            事業者向けアプリ(selenia-aroma-master)と入口の見た目が似ていて、
            どちらを開いているのか分からないという声があったため、誰向けの
            アプリなのかをここで言い切る。
          */}
          <span className="inline-flex items-center rounded-full bg-[#efe7f8] px-3 py-1 text-xs font-bold tracking-wide text-[#6b53a0]">
            お客様用
          </span>
          <h1 className="mt-3 text-2xl font-bold text-stone-900">Selenia Aroma</h1>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            あなたのために調香したオイルの記録を、いつでも手元に。
          </p>
        </div>
        <label className="block text-sm font-bold text-stone-700">
          メール
          <input value={loginId} onChange={(e) => setLoginId(e.target.value)} type="text" inputMode="email" autoComplete="email" className="mt-2 h-14 w-full rounded-2xl border border-[#e4d8c7] bg-[#faf7f1] px-4 text-base outline-none transition focus:border-[#9b82c8]" required />
        </label>
        <label className="mt-4 block text-sm font-bold text-stone-700">
          パスワード
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="mt-2 h-14 w-full rounded-2xl border border-[#e4d8c7] bg-[#faf7f1] px-4 text-base outline-none transition focus:border-[#9b82c8]" required />
        </label>
        {error ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
        <button disabled={loading} className="mt-6 h-14 w-full rounded-full bg-[#755aa8] text-base font-bold text-white shadow-lg shadow-[#755aa8]/25 transition hover:brightness-105 active:scale-95 disabled:opacity-60" type="submit" aria-label="ログイン">
          {loading ? "ログイン中..." : "ログイン"}
        </button>
        <p className="mt-4 text-center text-xs leading-5 text-stone-500">
          ログイン情報は施術を受けたサロンからお受け取りください。
        </p>
      </form>
    </main>
  );
}
