import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  AccessDeniedError,
  assertCanReadOperatorTable,
  assertOperator,
  buildAromaRecordScope,
  buildProfileScope,
  selectWithScope,
  type Viewer,
} from "./access.ts";

const SAKURA: Viewer = { role: "customer", userId: "user-sakura" };
const REN: Viewer = { role: "customer", userId: "user-ren" };
const OPERATOR: Viewer = { role: "operator", userId: "user-staff" };
const ADMIN: Viewer = { role: "admin", userId: "user-admin" };
const GUEST: Viewer = { role: "guest" };

let db: DatabaseSync;

function rows(condition: { sql: string; params: unknown[] }) {
  return db.prepare(condition.sql).all(...(condition.params as never[]));
}

before(() => {
  db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../../../cloudflare/d1/0001_initial.sql", import.meta.url), "utf8"));
  db.exec(`insert into stores (id,store_code,name) values ('store-ginza','01','銀座店')`);
  db.exec(`
    insert into profiles (id,user_id,store_id,customer_number,name,role) values
      ('p1','user-sakura','store-ginza','01260001','田中 さくら','customer'),
      ('p2','user-ren','store-ginza','01260002','佐藤 蓮','customer'),
      ('p3','user-staff',null,null,'測定担当','operator')
  `);
  db.exec(`
    insert into aroma_records (id,user_id,title,made_at,status) values
      ('r1','user-sakura','さくらの公開記録','2026-05-08','published'),
      ('r2','user-sakura','さくらの下書き','2026-05-09','draft'),
      ('r3','user-ren','蓮の公開記録','2026-04-18','published')
  `);
  db.exec(`
    insert into hearing_sheets (id,aroma_record_id,user_id,health_notes,medication_notes) values
      ('h1','r1','user-sakura','持病あり','服薬あり')
  `);
});

describe("アロマ記録の絞り込み", () => {
  test("顧客は自分の公開済み記録だけが見える", () => {
    const result = rows(selectWithScope("aroma_records", "id,user_id,status", buildAromaRecordScope(SAKURA)));
    assert.deepEqual(result.map((r) => r.id), ["r1"]);
  });

  test("顧客に他人の記録は1件も返らない", () => {
    const result = rows(selectWithScope("aroma_records", "id,user_id", buildAromaRecordScope(SAKURA)));
    assert.equal(result.some((r) => r.user_id !== "user-sakura"), false);
  });

  test("顧客に自分の下書きも返らない", () => {
    const result = rows(selectWithScope("aroma_records", "id,status", buildAromaRecordScope(SAKURA)));
    assert.equal(result.some((r) => r.status === "draft"), false);
  });

  test("別の顧客からはさくらの記録が見えない", () => {
    const result = rows(selectWithScope("aroma_records", "id", buildAromaRecordScope(REN)));
    assert.deepEqual(result.map((r) => r.id), ["r3"]);
  });

  test("事業者は下書きを含む全件が見える", () => {
    const result = rows(selectWithScope("aroma_records", "id", buildAromaRecordScope(OPERATOR)));
    assert.equal(result.length, 3);
  });

  test("未ログインには1件も返らない", () => {
    const result = rows(selectWithScope("aroma_records", "id", buildAromaRecordScope(GUEST)));
    assert.equal(result.length, 0);
  });

  test("呼び出し側の追加条件では絞り込みを外せない", () => {
    // 追加条件に or を書いて他人の記録を混ぜようとしても、scopeがandで囲まれるため通らない
    const result = rows(
      selectWithScope("aroma_records", "id", buildAromaRecordScope(SAKURA), {
        extraSql: "1 = 1 or user_id = 'user-ren'",
      }),
    );
    assert.deepEqual(result.map((r) => r.id), ["r1"]);
  });
});

describe("顧客プロフィールの絞り込み", () => {
  test("顧客には自分以外の氏名と顧客番号が返らない", () => {
    const result = rows(selectWithScope("profiles", "user_id,name,customer_number", buildProfileScope(SAKURA)));
    assert.deepEqual(result.map((r) => r.user_id), ["user-sakura"]);
    assert.equal(result.some((r) => r.customer_number === "01260002"), false);
  });

  test("事業者には全員が見える", () => {
    const result = rows(selectWithScope("profiles", "user_id", buildProfileScope(ADMIN)));
    assert.equal(result.length, 3);
  });

  test("未ログインには1件も返らない", () => {
    const result = rows(selectWithScope("profiles", "user_id", buildProfileScope(GUEST)));
    assert.equal(result.length, 0);
  });
});

describe("事業者専用の情報", () => {
  test("顧客はヒアリングシートを読めない", () => {
    assert.throws(() => assertCanReadOperatorTable(SAKURA, "hearing_sheets"), AccessDeniedError);
  });

  test("顧客は内部配合比率を読めない", () => {
    assert.throws(() => assertCanReadOperatorTable(SAKURA, "base_blend_private_recipes"), AccessDeniedError);
  });

  test("未ログインも読めない", () => {
    assert.throws(() => assertCanReadOperatorTable(GUEST, "hearing_sheets"), AccessDeniedError);
  });

  test("事業者は読める", () => {
    assert.doesNotThrow(() => assertCanReadOperatorTable(OPERATOR, "hearing_sheets"));
    assert.doesNotThrow(() => assertOperator(ADMIN));
  });

  test("顧客がassertOperatorを通ると例外になる", () => {
    assert.throws(() => assertOperator(SAKURA), AccessDeniedError);
  });
});
