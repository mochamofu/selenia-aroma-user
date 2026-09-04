import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { AccessDeniedError, type Viewer } from "./access.ts";
import { createSqliteRunner } from "./sqliteRunner.ts";
import { listAuditForSubject } from "./audit.ts";
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
  listStoreCustomers,
  listVisits,
  searchCustomers,
} from "./repositories.ts";

const SAKURA: Viewer = { role: "customer", userId: "user-sakura" };
const REN: Viewer = { role: "customer", userId: "user-ren" };
const OPERATOR: Viewer = { role: "operator", userId: "user-staff", storeId: "store-ginza" };
// 大阪店の施術者。銀座店の担当者に大阪の顧客が見えないことを確かめるために使う。
const OSAKA_OPERATOR: Viewer = { role: "operator", userId: "user-staff-osaka", storeId: "store-osaka" };
// 最高権限。全店舗が見える。
const ADMIN: Viewer = { role: "admin", userId: "user-admin" };
const GUEST: Viewer = { role: "guest" };

let db: ReturnType<typeof createSqliteRunner>;

before(() => {
  const raw = new DatabaseSync(":memory:");
  const dir = new URL("../../../cloudflare/d1/", import.meta.url);
  raw.exec(readFileSync(new URL("0001_initial.sql", dir), "utf8"));
  raw.exec(readFileSync(new URL("0002_seed.sql", dir), "utf8"));
  raw.exec(readFileSync(new URL("0003_audit_consent.sql", dir), "utf8"));
  raw.exec(readFileSync(new URL("0004_store_scope.sql", dir), "utf8"));
  // 別店舗と、同姓同名の顧客を用意する
  raw.exec(`insert into stores (id,store_code,name) values ('store-osaka','002','大阪店')`);
  raw.exec(`
    update profiles set name_kana = 'たなか さくら', last_visit_at = '2026-05-08' where user_id = 'user-sakura';
    update profiles set name_kana = 'さとう れん', last_visit_at = '2026-04-18' where user_id = 'user-ren';
  `);
  raw.exec(`
    insert into profiles (id,user_id,store_id,customer_number,name,name_kana,role,last_visit_at) values
      ('p-kato1','user-kato1','store-ginza','2600009','加藤 洋子','かとう ようこ','customer','2026-06-01'),
      ('p-kato2','user-kato2','store-osaka','2620001','加藤 洋子','かとう ようこ','customer','2026-07-15')
  `);
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
  // 来店記録。「その店舗で診断した人」を決める根拠になる。
  //   さくら … 銀座で2回、そのあと大阪へ1回(店舗をまたいだ常連)
  //   蓮     … 銀座のみ
  //   加藤(大阪) … 大阪のみ
  //   加藤(銀座) … 来店記録なし(登録だけ済んで未来店)
  raw.exec(`
    insert into visits (id,store_id,user_id,visited_at) values
      ('v1','store-ginza','user-sakura','2026-03-01'),
      ('v2','store-ginza','user-sakura','2026-05-08'),
      ('v3','store-osaka','user-sakura','2026-08-20'),
      ('v4','store-ginza','user-ren','2026-04-18'),
      ('v5','store-osaka','user-kato2','2026-07-15')
  `);
  db = createSqliteRunner(raw);
});

describe("投入したデータが読める", () => {
  test("ベースブレンドは12件", async () => assert.equal((await listBaseBlends(db)).length, 12));
  test("精油は36件", async () => assert.equal((await listEssentialOils(db)).length, 36));
  test("顧客番号で顧客を引ける", async () => {
    const p = await findProfileByCustomerNumber(db, OPERATOR, "2600003");
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
    assert.equal(await findProfileByCustomerNumber(db, REN, "2600001"), null);
  });
  test("事業者には全顧客が返る", async () => {
    assert.equal((await listProfiles(db, OPERATOR)).length, 10);
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
    // 顧客数は自店に来店した人だけを数える(銀座はさくらと蓮の2名)。
    // 全店の合計を見られるのは管理者だけ。
    assert.equal(await countCustomers(db, OPERATOR), 2);
  });
});

describe("閲覧の記録（監査ログ）", () => {
  test("事業者がヒアリングシートを開くと、誰の情報を見たかが残る", async () => {
    await listHearingSheets(db, OPERATOR, "r1", "調香前の確認");
    const rows = await listAuditForSubject(db, "user-sakura");
    const hit = rows.find((r) => (r as { target_table: string }).target_table === "hearing_sheets");
    assert.ok(hit, "ヒアリングシートの閲覧が記録されていない");
    assert.equal((hit as { actor_user_id: string }).actor_user_id, "user-staff");
    assert.equal((hit as { action: string }).action, "view");
    assert.equal((hit as { reason: string }).reason, "調香前の確認");
  });

  test("事業者が顧客のカルテを開くと記録される", async () => {
    await findAromaRecord(db, OPERATOR, "r3");
    const rows = await listAuditForSubject(db, "user-ren");
    assert.ok(rows.some((r) => (r as { target_id: string }).target_id === "r3"));
  });

  test("顧客が自分の記録を見ただけでは記録されない", async () => {
    const before = (await listAuditForSubject(db, "user-sakura")).length;
    await findAromaRecord(db, SAKURA, "r1");
    const after = (await listAuditForSubject(db, "user-sakura")).length;
    assert.equal(after, before);
  });

  test("権限がなく弾かれた場合は記録も残らない", async () => {
    const before = (await listAuditForSubject(db, "user-sakura")).length;
    await assert.rejects(() => listHearingSheets(db, SAKURA, "r1"), AccessDeniedError);
    const after = (await listAuditForSubject(db, "user-sakura")).length;
    assert.equal(after, before);
  });

  test("内部配合比率の閲覧も記録される", async () => {
    await findPrivateRecipe(db, OPERATOR, "base-02");
    const rows = await db.all(
      "select target_table from audit_logs where target_table = 'base_blend_private_recipes'", [],
    );
    assert.ok(rows.length > 0);
  });
});

describe("顧客の呼び出し（検索）", () => {
  test("名前で全店から引ける。店舗をまたいだ同姓同名も両方出る", async () => {
    const rows = await searchCustomers(db, OPERATOR, "加藤");
    assert.equal(rows.length, 2);
    const stores = rows.map((r) => (r as { store_name: string }).store_name).sort();
    assert.deepEqual(stores, ["大阪店", "銀座店"]);
  });

  test("同姓同名は顧客番号と店舗で見分けられる", async () => {
    const rows = await searchCustomers(db, OPERATOR, "加藤 洋子");
    const numbers = rows.map((r) => (r as { customer_number: string }).customer_number).sort();
    assert.deepEqual(numbers, ["2600009", "2620001"]);
  });

  test("ふりがなでも引ける", async () => {
    const rows = await searchCustomers(db, OPERATOR, "かとう");
    assert.equal(rows.length, 2);
  });

  test("顧客番号でも引ける", async () => {
    const rows = await searchCustomers(db, OPERATOR, "2600003");
    assert.equal((rows[0] as { name: string }).name, "鈴木 美香");
  });

  test("最終来店日が新しい順に並ぶ", async () => {
    const rows = await searchCustomers(db, OPERATOR, "加藤");
    assert.equal((rows[0] as { customer_number: string }).customer_number, "2620001");
  });

  test("空の検索語では一覧が返らない", async () => {
    assert.equal((await searchCustomers(db, OPERATOR, "   ")).length, 0);
  });

  test("顧客は検索できない", async () => {
    await assert.rejects(() => searchCustomers(db, SAKURA, "加藤"), AccessDeniedError);
  });

  test("検索した事実が記録される", async () => {
    await searchCustomers(db, OPERATOR, "鈴木");
    const rows = await db.all(
      "select reason from audit_logs where target_table = 'profiles' and reason like '%鈴木%'", [],
    );
    assert.equal(rows.length, 1);
  });
});

describe("店舗ごとの見え方", () => {
  function names(rows: unknown[]) {
    return rows.map((r) => (r as { name: string }).name).sort();
  }
  function numbers(rows: unknown[]) {
    return rows.map((r) => (r as { customer_number: string }).customer_number).sort();
  }

  test("銀座の施術者には銀座に来店した人だけが並ぶ", async () => {
    const rows = await listStoreCustomers(db, OPERATOR);
    assert.deepEqual(names(rows), ["佐藤 蓮", "田中 さくら"]);
  });

  test("銀座の施術者に大阪だけの顧客は出ない", async () => {
    const rows = await listStoreCustomers(db, OPERATOR);
    assert.equal(numbers(rows).includes("2620001"), false);
  });

  test("大阪の施術者には大阪に来店した人だけが並ぶ", async () => {
    const rows = await listStoreCustomers(db, OSAKA_OPERATOR);
    assert.deepEqual(names(rows), ["加藤 洋子", "田中 さくら"]);
  });

  test("店舗をまたいだ常連は、両方の店舗の一覧に同じ顧客番号で載る", async () => {
    const ginza = await listStoreCustomers(db, OPERATOR);
    const osaka = await listStoreCustomers(db, OSAKA_OPERATOR);
    const inGinza = ginza.find((r) => (r as { name: string }).name === "田中 さくら");
    const inOsaka = osaka.find((r) => (r as { name: string }).name === "田中 さくら");
    assert.ok(inGinza && inOsaka);
    // 同じ人であることを顧客番号で判別できる。番号は店舗をまたいでも変わらない。
    assert.equal(
      (inGinza as { customer_number: string }).customer_number,
      (inOsaka as { customer_number: string }).customer_number,
    );
    assert.equal((inGinza as { user_id: string }).user_id, (inOsaka as { user_id: string }).user_id);
  });

  test("管理者には全店舗の顧客が見える", async () => {
    const rows = await listStoreCustomers(db, ADMIN);
    const all = numbers(rows);
    assert.ok(all.includes("2600001"), "銀座の顧客");
    assert.ok(all.includes("2620001"), "大阪の顧客");
    // 来店記録がまだ無い人も、管理者には見える
    assert.ok(all.includes("2600009"), "未来店の顧客");
  });

  test("未来店の顧客はどの店舗の一覧にも出ない", async () => {
    for (const viewer of [OPERATOR, OSAKA_OPERATOR]) {
      const rows = await listStoreCustomers(db, viewer);
      assert.equal(numbers(rows).includes("2600009"), false);
    }
  });

  test("一覧に出ない他店の顧客も、検索なら全店横断で必ず引ける", async () => {
    // 銀座の担当者が、大阪だけの顧客を顧客番号で呼び出せる
    const rows = await searchCustomers(db, OPERATOR, "2620001");
    assert.deepEqual(numbers(rows), ["2620001"]);
  });

  test("顧客数も一覧と同じ絞り込みで数える", async () => {
    assert.equal(await countCustomers(db, OPERATOR), 2);
    assert.equal(await countCustomers(db, OSAKA_OPERATOR), 2);
    assert.ok((await countCustomers(db, ADMIN)) >= 3);
  });

  test("顧客は店舗の顧客一覧を開けない", async () => {
    await assert.rejects(() => listStoreCustomers(db, SAKURA), AccessDeniedError);
    await assert.rejects(() => listStoreCustomers(db, GUEST), AccessDeniedError);
  });

  test("来店履歴は店舗をまたいで1本につながる", async () => {
    const rows = await listVisits(db, OPERATOR, "user-sakura");
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((r) => (r as { store_name: string }).store_name),
      ["大阪店", "銀座店", "銀座店"],
    );
  });

  test("顧客は来店履歴を開けない", async () => {
    await assert.rejects(() => listVisits(db, SAKURA, "user-sakura"), AccessDeniedError);
  });
});
