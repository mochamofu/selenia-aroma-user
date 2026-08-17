export const customerTabs = [
  { label: "ホーム", href: "/dashboard", icon: "Home" },
  { label: "コレクション", href: "/aromas", icon: "Layers" },
  { label: "気分から探す", href: "/moods", icon: "Sparkles" },
  { label: "お気に入り", href: "/aromas?tab=favorites", icon: "Heart" },
  { label: "マイページ", href: "/profile", icon: "User" },
] as const;
