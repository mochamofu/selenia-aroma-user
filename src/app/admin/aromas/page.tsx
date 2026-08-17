"use client";

import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { AromaCard } from "@/components/AromaCard";
import { useAromaRecords } from "@/hooks/useAromaRecords";
import { useAuth } from "@/hooks/useAuth";

export default function AdminAromasPage() {
  const { session } = useAuth("admin");
  const { records } = useAromaRecords(session?.userId, true);
  return (
    <AdminShell>
      <div className="space-y-5 px-5 py-6 lg:px-8 lg:py-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-stone-900">アロマ記録一覧</h1>
          <Link href="/admin/aromas/new" className="shrink-0 rounded-full bg-[#2f2a25] px-4 py-2 text-sm font-bold text-white transition hover:brightness-110">新規作成</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {records.map((record) => <AromaCard key={record.id} record={record} userId={session?.userId} />)}
        </div>
      </div>
    </AdminShell>
  );
}
