import type { Profile } from "@/types/profile";

export function buildOperatorCustomer(
  id: string,
  userId: string,
  name: string,
  createdAt: string,
  favoriteTypes: string[],
  frequentTimes: string[],
): Profile {
  return {
    id,
    user_id: userId,
    name,
    avatar_url: null,
    role: "customer",
    created_at: createdAt,
    favorite_types: favoriteTypes,
    frequent_times: frequentTimes,
  };
}

/**
 * 事業者側の顧客マスタ。脳波管理カルテ、管理者の顧客一覧、ダッシュボードの
 * 顧客数はすべてこの一覧を参照し、画面間で顧客が一致するようにする。
 */
export const operatorCustomers: Profile[] = [
  buildOperatorCustomer("profile-sakura", "user-sakura", "田中 さくら", "2026-01-12T00:00:00.000Z", ["リラックス系", "ウッディ系"], ["夜", "就寝前"]),
  buildOperatorCustomer("profile-ren", "user-ren", "佐藤 蓮", "2026-01-28T00:00:00.000Z", ["集中系", "ミント系"], ["朝", "仕事前"]),
  buildOperatorCustomer("profile-mika", "user-mika", "鈴木 美香", "2026-02-08T00:00:00.000Z", ["フローラル系", "バランス系"], ["夕方", "入浴後"]),
  buildOperatorCustomer("profile-haruto", "user-haruto", "高橋 陽斗", "2026-02-19T00:00:00.000Z", ["シトラス系", "リフレッシュ系"], ["昼", "外出前"]),
  buildOperatorCustomer("profile-natsumi", "user-natsumi", "中村 夏美", "2026-03-02T00:00:00.000Z", ["ハーバル系", "睡眠系"], ["夜", "休日"]),
  buildOperatorCustomer("profile-naoto", "user-naoto", "小林 直人", "2026-03-14T00:00:00.000Z", ["森林系", "集中系"], ["朝", "作業前"]),
  buildOperatorCustomer("profile-eriko", "user-eriko", "伊藤 恵理子", "2026-03-27T00:00:00.000Z", ["樹脂系", "落ち着き系"], ["夕方", "瞑想前"]),
  buildOperatorCustomer("profile-daichi", "user-daichi", "森田 大地", "2026-04-05T00:00:00.000Z", ["スパイス系", "元気系"], ["午前", "運動前"]),
];
