"use client";

import { demoBaseBlends, demoMoods } from "@/data/mockData";
import { essentialOils } from "@/data/essentialOils";
import type { BaseBlend, EssentialOil, MoodCategory } from "@/types/aroma";

/**
 * 図鑑データ（ベースブレンド・精油・気分カテゴリ）の取得。
 *
 * D1はWorkersのバインディング経由でしか触れないため、画面からは直接読めない。
 * APIルート(/api/catalog/*)を通して取る。
 *
 * D1へつながらない環境（移行前のVercel、ローカルのnpm run dev）では、
 * APIが固定データを返す。取得そのものが失敗したときも、画面を白くせず
 * 固定データへ落とす。図鑑は公開情報なので、多少古くても表示を優先する。
 */

export type CatalogResult<T> = { items: T[]; source: "d1" | "mock" };

async function fetchCatalog<T>(path: string, fallback: T[]): Promise<CatalogResult<T>> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return { items: fallback, source: "mock" };
    const body = (await res.json()) as { source?: string; items?: T[] };
    if (!Array.isArray(body.items)) return { items: fallback, source: "mock" };
    return { items: body.items, source: body.source === "d1" ? "d1" : "mock" };
  } catch {
    // 通信できないときも画面は出す。図鑑は公開情報なので落とさない
    return { items: fallback, source: "mock" };
  }
}

export function fetchBaseBlends(): Promise<CatalogResult<BaseBlend>> {
  return fetchCatalog<BaseBlend>("/api/catalog/base-blends", demoBaseBlends);
}

export function fetchEssentialOils(): Promise<CatalogResult<EssentialOil>> {
  return fetchCatalog<EssentialOil>("/api/catalog/essential-oils", essentialOils);
}

export function fetchMoodCategories(): Promise<CatalogResult<MoodCategory>> {
  return fetchCatalog<MoodCategory>("/api/catalog/moods", demoMoods);
}
