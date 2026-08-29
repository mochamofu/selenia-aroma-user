import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { AccessDeniedError, type Viewer } from "./access.ts";
import { createSqliteRunner } from "./sqliteRunner.ts";
import {
  countCustomers,
  findAromaRecord,
  findPrivateRecipe,
  findProfileByCustomerNumber,
  listAromaRecords,
  listBaseBlends,
  listBrainwaveImages,
  listEssentialOils,
  listHearingSheets,
  listIngredients,
  listProfiles,
} from "./repositories.ts";

const SAKURA: Viewer = { role: "customer", userId: "user-sakura" };
const REN: Viewer = { role: "customer", userId: "user-ren" };
const OPERATOR: Viewer = { role: "operator", userId: "user-staff" };
const GUEST: Viewer = { role: "guest" };

let db: ReturnType<typeof createSqliteRunner>;

before(() => {
  const raw = new DatabaseSync(":memory:");
  const dir = new URL("../../../cloudflare/d1/", import.meta.url);
  raw.exec(readFileSync(new URL("0001_initial.sql", dir), "utf8"));
  raw.exec(readFileSync(new URL("0002_seed.sql", dir), "utf8"));
  raw.exec(`
    insert into aroma_records (id,user_id,title,made_at,status,base_blend_id) values
      ('r1','user-sakura','さくらの公開記録','2026-05-08','published','base-02'),
      ('r2','user-sakura','さくらの下書き','2026-05-09','draft','base-02'),
      ('r3','user-ren','蓮の公開記録','2026-04-18','published','base-10')
  `);
  raw.exec(`
    insert into aroma_ingredients (id,aroma_record_id,name,amount,unit,sort_order) values
      ('i1','r1','ラベンダー','3','滴',1), ('i2','r3','レモン','2','滴',1)
  `);
  raw.exec(`insert into brainwave_images (id,user_id,r2_key,title) values ('b1','user-sakura','k1','1分測定'),('b2','user-ren','k2','1分測定')`);
  raw.exec(`insert into hearing_sheets (id,aroma_record_id,user_id,health_notes) values ('h1','r1','user-sakura','持病あり')`);
  raw.exec(`insert into base_blend_private_recipes (id,base_blend_id,internal_ratio) values ('pr1','base-02','2:1.2:1.65')`);
  db = createSqliteRunner(raw);
});

describe("投入したデータが読める", () => {
  test("ベースブレンドは12件", async () => assert.equal((await listBaseBlends(db)).length, 12));
  test("精油は36件", async () => assert.equal((await listEssentialOils(db)).length, 36));
  test("顧客番号で顧客を引ける", async () => {
    const p = await findProfileByCustomerNumber(db, OPERATOR, "01260003");
    assert.equal((p as { name: string }).name, "鈴木 美香");
  });
});

describe("アロマ記録の権限", () => {
  test("顧客は自分の公開済みだけ", async () => {
    const rows = await listAromaRecords(db, SAKURA);
    assert.deepEqual(rows.map((r) => (r as { id: string }).id), ["r1"]);
  });
  test("顧客は他人の記録をIDを知っていても取れない", async () => {
    assert.equal(await findAromaRecord(db, SAKURA, "r3"), null);
  });
  test("顧客は自分の下書きもIDを知っていても取れない", async () => {
    assert.equal(await findAromaRecord(db, SAKURA, "r2"), null);
  });
  test("事業者は全件見える", async () => {
    assert.equal((await listAromaRecords(db, OPERATOR)).length, 3);
  });
  test("未ログインは0件", async () => {
    assert.equal((await listAromaRecords(db, GUEST)).length, 0);
  });
});

describe("材料と画像の権限", () => {
  test("他人の記録の材料は取れない", async () => {
    assert.equal((await listIngredients(db, SAKURA, "r3")).length, 0);
  });
  test("自分の公開済み記録の材料は取れる", async () => {
    assert.equal((await listIngredients(db, SAKURA, "r1")).length, 1);
  });
  test("他人の脳波画像は取れない", async () => {
    assert.equal((await listBrainwaveImages(db, SAKURA, "user-ren")).length, 0);
  });
  test("自分の脳波画像は取れる", async () => {
    assert.equal((await listBrainwaveImages(db, SAKURA, "user-sakura")).length, 1);
  });
  test("事業者は他人の脳波画像も取れる", async () => {
    assert.equal((await listBrainwaveImages(db, OPERATOR, "user-ren")).length, 1);
  });
});

describe("顧客一覧の権限", () => {
  test("顧客には自分1件だけ返る", async () => {
    const rows = await listProfiles(db, SAKURA);
    assert.equal(rows.length, 1);
    assert.equal((rows[0] as { user_id: string }).user_id, "user-sakura");
  });
  test("顧客は他人の顧客番号を引けない", async () => {
    assert.equal(await findProfileByCustomerNumber(db, REN, "01260001"), null);
  });
  test("事業者には8件返る", async () => {
    assert.equal((await listProfiles(db, OPERATOR)).length, 8);
  });
});

describe("事業者専用の情報", () => {
  test("顧客はヒアリングシートを取れない", async () => {
    await assert.rejects(() => listHearingSheets(db, SAKURA, "r1"), AccessDeniedError);
  });
  test("顧客は内部配合比率を取れない", async () => {
    await assert.rejects(() => findPrivateRecipe(db, SAKURA, "base-02"), AccessDeniedError);
  });
  test("顧客は顧客数を数えられない", async () => {
    await assert.rejects(() => countCustomers(db, SAKURA), AccessDeniedError);
  });
  test("事業者は取れる", async () => {
    assert.equal((await listHearingSheets(db, OPERATOR, "r1")).length, 1);
    assert.ok(await findPrivateRecipe(db, OPERATOR, "base-02"));
    assert.equal(await countCustomers(db, OPERATOR), 8);
  });
});
