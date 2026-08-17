"use client";

/**
 * カルテの下書きの保存先。現在はブラウザのlocalStorageに保存する。
 *
 * Supabaseへ移行するときは、このファイルの4つの関数の中身を
 * Supabaseの呼び出しに差し替える。呼び出し側（/operator）は変更しない。
 */

const STORAGE_KEY = "selenia-karte-drafts-v1";

export type StoredKarteDraft = { id: string; customerId: string } & Record<string, unknown>;

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function loadKarteDrafts<T extends StoredKarteDraft>(): T[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is T =>
      typeof item === "object" && item !== null && typeof (item as StoredKarteDraft).id === "string",
    );
  } catch {
    // 壊れた値が入っていても画面を落とさない。読み捨てて空から始める。
    return [];
  }
}

export function saveKarteDrafts<T extends StoredKarteDraft>(drafts: T[]): boolean {
  if (!canUseStorage()) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    return true;
  } catch {
    // 容量超過などで保存できない場合がある。呼び出し側で通知する。
    return false;
  }
}

export function clearKarteDrafts() {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 消せなくても続行する
  }
}
