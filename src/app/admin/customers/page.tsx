"use client";

import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { Icon } from "@/components/Icon";
import { operatorCustomers } from "@/data/operatorCustomers";
import { useAuth } from "@/hooks/useAuth";

export default function AdminCustomersPage() {
  useAuth("admin");
  return (
    <AdminShell>
      <div className="space-y-5 px-5 py-6 lg:px-8 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">顧客一覧</h1>
            <p className="mt-1 text-sm text-stone-500">顧客を選ぶと脳波管理カルテが開きます。</p>
          </div>
          <Link href="/operator" className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-[#2f2a25] px-5 text-sm font-bold text-white transition hover:brightness-110">
            <Icon name="Plus" className="h-4 w-4" />
            カルテを追加
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {operatorCustomers.map((profile) => (
            <Link
              key={profile.id}
              href={`/operator?customer=${encodeURIComponent(profile.user_id)}`}
              className="flex items-center gap-3 rounded-[24px] bg-white p-4 shadow-md shadow-stone-300/20 transition hover:shadow-lg hover:shadow-stone-300/40"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#d7c58e] font-bold text-white">{profile.name.slice(0, 1)}</div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-bold text-stone-900">{profile.name}</h2>
                <p className="font-mono text-xs tracking-[0.08em] text-[#755aa8]">{profile.customer_number ?? "未採番"}</p>
                <p className="text-xs text-stone-500">登録日 {profile.created_at.slice(0, 10)}</p>
              </div>
              <Icon name="ChevronRight" className="h-5 w-5 shrink-0 text-stone-400" />
            </Link>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
