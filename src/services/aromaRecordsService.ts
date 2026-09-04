"use client";

import type { AromaIngredient, AromaRecord } from "@/types/aroma";

/**
 * 制作記録の取得。
 *
 * 誰の記録かはサーバがセッションから決めるため、ここからユーザーIDを
 * 送らない。送ってもサーバは見ない。「画面が指定した相手の記録を返す」形に
 * すると、他人のIDを送るだけで他人のカルテが読めてしまう。
 */

function toRecord(row: Record<string, unknown>): AromaRecord {
  return row as unknown as AromaRecord;
}

export async function getAromaRecords(): Promise<AromaRecord[]> {
  const res = await fetch("/api/records", { cache: "no-store", credentials: "same-origin" });
  if (res.status === 401) return [];
  if (!res.ok) throw new Error("記録を読み込めませんでした");
  const body = (await res.json()) as { items?: Record<string, unknown>[] };
  return (body.items ?? []).map(toRecord);
}

export async function getAromaRecordById(
  id: string,
): Promise<{ record: AromaRecord; ingredients: AromaIngredient[] } | null> {
  const res = await fetch(`/api/records/${encodeURIComponent(id)}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  // 他人の記録も存在しない記録も404。区別しないのはサーバ側の意図的な設計
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) throw new Error("記録を読み込めませんでした");

  const body = (await res.json()) as {
    record?: Record<string, unknown>;
    ingredients?: AromaIngredient[];
  };
  if (!body.record) return null;
  return { record: toRecord(body.record), ingredients: body.ingredients ?? [] };
}
