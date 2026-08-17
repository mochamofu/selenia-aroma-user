"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AdminBottomNav } from "./AdminBottomNav";
import { AdminSideNav } from "./AdminSideNav";
import { BottomNav } from "./BottomNav";

export function AppShell({
  children,
  variant = "customer",
  withNav = true,
}: {
  children: ReactNode;
  variant?: "customer" | "admin";
  withNav?: boolean;
}) {
  const pathname = usePathname();

  if (variant === "admin") {
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

  return (
    <div className="mx-auto min-h-screen w-full max-w-[430px] overflow-hidden bg-[#FAF7F1] shadow-2xl shadow-stone-300/60">
      <main className={withNav ? "min-h-screen pb-28" : "min-h-screen"}>{children}</main>
      {withNav ? <BottomNav pathname={pathname} /> : null}
    </div>
  );
}
