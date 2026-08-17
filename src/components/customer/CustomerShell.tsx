"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BottomNav } from "./BottomNav";

/**
 * 購入者向け画面の外枠。スマートフォン前提の430px固定レイアウトを維持する。
 * 管理者・事業者側の画面はこのシェルを使わない（src/components/admin/AdminShell.tsx）。
 */
export function CustomerShell({ children, withNav = true }: { children: ReactNode; withNav?: boolean }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto min-h-screen w-full max-w-[430px] overflow-hidden bg-[#FAF7F1] shadow-2xl shadow-stone-300/60">
      <main className={withNav ? "min-h-screen pb-28" : "min-h-screen"}>{children}</main>
      {withNav ? <BottomNav pathname={pathname} /> : null}
    </div>
  );
}
