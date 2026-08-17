import Link from "next/link";
import { adminTabs, isAdminTabActive } from "@/lib/routes";
import { Icon } from "./Icon";

export function AdminSideNav({ pathname }: { pathname: string }) {
  return (
    <aside className="hidden w-[236px] shrink-0 border-r border-[#e7ded0] bg-white px-4 py-5 md:block" aria-label="管理者サイドナビゲーション">
      <div className="flex items-center gap-3 border-b border-[#e7ded0] pb-5">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#755aa8] text-white">
          <Icon name="Sparkles" className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold tracking-[0.08em] text-stone-900">SELENIA</p>
          <p className="text-xs text-stone-500">Admin Console</p>
        </div>
      </div>
      <nav className="mt-5 space-y-1">
        {adminTabs.map((item) => {
          const active = isAdminTabActive(item.href, pathname);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex h-11 items-center gap-3 rounded-2xl px-3 text-sm font-bold transition ${
                active ? "bg-[#efe8fb] text-[#755aa8]" : "text-stone-600 hover:bg-[#faf7f1]"
              }`}
            >
              <Icon name={item.icon} className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-6 space-y-3 rounded-2xl border border-[#e7ded0] bg-[#faf7f1] p-3">
        <p className="text-xs font-bold text-stone-500">別画面</p>
        <Link href="/operator" className="flex h-11 items-center gap-3 rounded-2xl bg-white px-3 text-sm font-bold text-stone-700 shadow-sm transition hover:brightness-[0.98]">
          <Icon name="BarChart3" className="h-4 w-4 text-[#755aa8]" />
          脳波カルテ
        </Link>
      </div>
    </aside>
  );
}
