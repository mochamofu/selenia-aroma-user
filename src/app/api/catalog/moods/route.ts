import { getDb } from "@/server/db/context";
import { listMoodCategories } from "@/server/db/repositories";
import { demoMoods } from "@/data/mockData";

/** 気分カテゴリ。公開情報のみ。権限の判定は不要。 */
export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  if (!db) return Response.json({ source: "mock", items: demoMoods });

  return Response.json({ source: "d1", items: await listMoodCategories(db) });
}
