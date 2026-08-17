export const adminTabs = [
  { label: "ダッシュボード", href: "/admin", icon: "BarChart3" },
  { label: "顧客", href: "/admin/customers", icon: "Users" },
  { label: "アロマ記録", href: "/admin/aromas", icon: "FlaskConical" },
  { label: "設定", href: "/admin#settings", icon: "Settings" },
] as const;

export function isAdminTabActive(href: string, pathname: string) {
  return pathname === href || (href.includes("/aromas") && pathname.startsWith("/admin/aromas"));
}
