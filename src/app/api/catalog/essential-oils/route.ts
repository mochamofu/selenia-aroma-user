import { getDb } from "@/server/db/context";
import { listEssentialOils } from "@/server/db/repositories";
import { essentialOils } from "@/data/essentialOils";

/** 精油図鑑。公開情報のみ。権限の判定は不要。 */
export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  if (!db) return Response.json({ source: "mock", items: essentialOils });

  const rows = await listEssentialOils(db);
  return Response.json({
    source: "d1",
    items: rows.map((row) => ({
      ...row,
      common_uses: parseJsonArray(row.common_uses),
      mood_slugs: parseJsonArray(row.mood_slugs),
      blends_well_with: parseJsonArray(row.blends_well_with),
    })),
  });
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
