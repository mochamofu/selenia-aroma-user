"use client";

import { useEffect, useState } from "react";
import { getAromaRecordById, getAromaRecords } from "@/services/aromaRecordsService";
import type { AromaIngredient, AromaRecord } from "@/types/aroma";

/**
 * 制作記録を画面へ渡す。
 *
 * 誰の記録かはサーバがセッションから決めるため、ここで相手を指定しない。
 * 引数の userId は「ログインが済んだか」を待つためだけに使う。
 */
export function useAromaRecords(userId?: string) {
  const [records, setRecords] = useState<AromaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    getAromaRecords()
      .then((rows) => alive && setRecords(rows))
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [userId]);

  return { records, loading, error };
}

export function useAromaRecord(id: string, userId?: string) {
  const [record, setRecord] = useState<AromaRecord | null>(null);
  const [ingredients, setIngredients] = useState<AromaIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    getAromaRecordById(id)
      .then((found) => {
        if (!alive) return;
        setRecord(found?.record ?? null);
        setIngredients(found?.ingredients ?? []);
      })
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id, userId]);

  return { record, ingredients, loading, error };
}
