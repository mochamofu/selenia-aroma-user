import { getViewer } from "@/server/auth/viewer";
import { getDb } from "@/server/db/context";
import { readOwnContact, saveOwnContact } from "@/server/db/shopRepository";
import { validateContact } from "@/lib/shop";

/**
 * 自分のお届け先。お客様本人だけが読み書きする（誰の分かはセッションで決める）。
 * はじめて保存するときは、個人情報の取り扱いへの同意（consent: true）が要る。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await getViewer(request);
  if (viewer.role !== "customer") return Response.json({ error: "ログインしてください" }, { status: 401 });
  const db = await getDb();
  if (!db) return Response.json({ error: "データベースに接続できません" }, { status: 503 });
  return Response.json({ contact: await readOwnContact(db, viewer) });
}

export async function PUT(request: Request) {
  const viewer = await getViewer(request);
  if (viewer.role !== "customer") return Response.json({ error: "ログインしてください" }, { status: 401 });
  const db = await getDb();
  if (!db) return Response.json({ error: "データベースに接続できません" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = validateContact(body);
  if (!checked.ok) return Response.json({ error: "入力を確かめてください", fields: checked.errors }, { status: 400 });
  const result = await saveOwnContact(db, viewer, checked.value, body.consent === true);
  if (result === "no_consent") {
    return Response.json({ error: "個人情報の取り扱いへの同意が必要です" }, { status: 409 });
  }
  return Response.json({ contact: await readOwnContact(db, viewer) });
}
