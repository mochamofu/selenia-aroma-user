import { getDb } from "@/server/db/context";

/**
 * D1につながっているかを確かめるための口。
 * 移行中は「いま固定データなのかD1なのか」が画面から見えないと切り分けができない。
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  if (!db) {
    return Response.json({ source: "mock", connected: false, tables: null });
  }
  const rows = await db.all<{ name: string }>(
    "select name from sqlite_master where type = 'table' order by name",
    [],
  );
  return Response.json({
    source: "d1",
    connected: true,
    tables: rows.map((r) => r.name),
  });
}
