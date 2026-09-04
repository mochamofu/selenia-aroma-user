import { getDb } from "@/server/db/context";
import { listBaseBlends } from "@/server/db/repositories";
import { demoBaseBlends } from "@/data/mockData";

/**
 * ベースブレンド一覧。
 *
 * 誰が見てもよい公開情報のみを返す。内部配合比率は
 * base_blend_private_recipes という別の表にあり、ここでは触らない。
 * そのため権限の判定が要らず、認証の実装を待たずにD1へ移せる。
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  if (!db) return Response.json({ source: "mock", items: demoBaseBlends });

  const rows = await listBaseBlends(db);
  return Response.json({ source: "d1", items: rows.map(toBaseBlend) });
}

/** D1はJSONを文字列で持つため、配列に戻してから画面へ渡す。 */
function toBaseBlend(row: Record<string, unknown>) {
  return {
    ...row,
    public_ingredients: parseJsonArray(row.public_ingredients),
    benefits: parseJsonArray(row.benefits),
    mood_slugs: parseJsonArray(row.mood_slugs),
  };
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
