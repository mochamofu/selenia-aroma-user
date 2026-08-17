"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AdminBottomNav } from "./AdminBottomNav";
import { AdminSideNav } from "./AdminSideNav";

/**
 * 管理者向け画面の外枠。768px以上でサイドナビ、それ未満でボトムナビを出す。
 * 購入者向け画面はこのシェルを使わない（src/components/customer/CustomerShell.tsx）。
 * このファイルの変更は購入者向け画面に影響しない。
 */
export function AdminShell({ children, withNav = true }: { children: ReactNode; withNav?: boolean }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#FAF7F1]">
      <div className="flex min-h-screen">
        {withNav ? <AdminSideNav pathname={pathname} /> : null}
        <main className={`min-w-0 flex-1 ${withNav ? "pb-28 md:pb-12" : ""}`}>
          <div className="mx-auto w-full max-w-[1180px]">{children}</div>
        </main>
      </div>
      {withNav ? <AdminBottomNav pathname={pathname} /> : null}
    </div>
  );
}
