"use client";

import { useEffect, useState } from "react";
import {
  fetchBaseBlends,
  fetchEssentialOils,
  fetchMoodCategories,
  type CatalogResult,
} from "@/services/catalogService";
import { demoBaseBlends, demoMoods } from "@/data/mockData";
import { essentialOils } from "@/data/essentialOils";
import type { BaseBlend, EssentialOil, MoodCategory } from "@/types/aroma";

/**
 * 図鑑データを画面へ渡す。
 *
 * 最初は固定データを返し、D1から取れたら差し替える。読み込み中の空白を
 * 出さないための作りで、図鑑は公開情報なので古い内容が一瞬見えても困らない。
 * 逆に個人のカルテでこれをやってはいけない（他人の情報が一瞬見える作りに
 * つながるため）。
 *
 * source は「いま表示しているのがD1のデータか固定データか」。移行中の
 * 切り分けに使う。
 */
function useCatalog<T>(load: () => Promise<CatalogResult<T>>, fallback: T[]) {
  const [items, setItems] = useState<T[]>(fallback);
  const [source, setSource] = useState<"d1" | "mock">("mock");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    load()
      .then((result) => {
        if (!alive) return;
        setItems(result.items);
        setSource(result.source);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // load は各フックで固定の関数を渡すため、依存に入れずに初回だけ実行する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { items, source, loading };
}

export function useBaseBlends() {
  return useCatalog<BaseBlend>(fetchBaseBlends, demoBaseBlends);
}

export function useEssentialOils() {
  return useCatalog<EssentialOil>(fetchEssentialOils, essentialOils);
}

export function useMoodCategories() {
  return useCatalog<MoodCategory>(fetchMoodCategories, demoMoods);
}
