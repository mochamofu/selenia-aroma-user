import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { Viewer } from "./access.ts";
import { createSqliteRunner } from "./sqliteRunner.ts";
import {
  createOrder,
  findOwnOrder,
  listOwnOrders,
  markOrderPaid,
  readOwnContact,
  readShopSettings,
  saveOwnContact,
  setPaymentRef,
} from "./shopRepository.ts";

const SAKURA: Viewer = { role: "customer", userId: "user-sakura" };
const REN: Viewer = { role: "customer", userId: "user-ren" };
const OPERATOR: Viewer = { role: "operator", userId: "user-staff", storeId: "store-ginza" };
const ADDRESS = { shipName: "", postalCode: "100-0001", address1: "東京都千代田区（テスト）", address2: "", phone: "090-0000-0000", email: "" };

let db: ReturnType<typeof createSqliteRunner>;

before(() => {
  const raw = new DatabaseSync(":memory:");
  const dir = new URL("../../../cloudflare/d1/", import.meta.url);
  for (const file of ["0001_initial.sql", "0002_seed.sql", "0003_audit_consent.sql", "0004_store_scope.sql", "0006_shop_orders.sql"]) {
    raw.exec(readFileSync(new URL(file, dir), "utf8"));
  }
  raw.exec(`
    insert into aroma_records (id,user_id,title,made_at,status,base_blend_name) values
      ('r1','user-sakura','さくらの公開記録','2026-05-08','published','①Elegant Harmony'),
      ('r2','user-sakura','さくらの下書き','2026-05-09','draft',''),
      ('r3','user-ren','蓮の公開記録','2026-04-18','published','')
  `);
  raw.exec(`insert into shop_settings (id, price_list, shipping_fee, free_shipping_over, accept_online, accept_bank, accept_store)
            values ('default', '[{"volumeMl":5,"price":3300},{"volumeMl":10,"price":5500}]', 500, 6000, 1, 1, 0)`);
  db = createSqliteRunner(raw);
});

describe("お届け先", () => {
  test("同意が無いうちは保存しない", async () => {
    assert.equal(await saveOwnContact(db, SAKURA, ADDRESS, false), "no_consent");
    assert.equal((await readOwnContact(db, SAKURA)).consentObtainedAt, null);
  });

  test("同意して保存すると、アプリでの同意として残る", async () => {
    assert.equal(await saveOwnContact(db, SAKURA, ADDRESS, true), "ok");
    const contact = await readOwnContact(db, SAKURA);
    assert.equal(contact.postalCode, "100-0001");
    assert.ok(contact.consentObtainedAt);
  });

  test("ほかの人のお届け先は読めない", async () => {
    assert.equal((await readOwnContact(db, REN)).postalCode, "");
    assert.equal((await readOwnContact(db, OPERATOR)).postalCode, "");
  });
});

describe("注文", () => {
  test("価格表から金額を出し直して、届け先を写す", async () => {
    const result = await createOrder(
      db,
      SAKURA,
      { aromaRecordId: "r1", volumeMl: 5, quantity: 1, paymentMethod: "bank", customerNote: "" },
      { onlineAvailable: false },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.order.total, 3800);
    assert.equal(result.order.status, "requested");
    assert.equal(result.order.paymentStatus, "unpaid");
    assert.equal((await readShopSettings(db)).priceList.length, 2);
  });

  test("下書き・他人の記録・価格表に無い容量・使えない支払い方法は受けない", async () => {
    const base = { aromaRecordId: "r1", volumeMl: 5, quantity: 1, paymentMethod: "bank" as const, customerNote: "" };
    const reasons = await Promise.all([
      createOrder(db, SAKURA, { ...base, aromaRecordId: "r2" }, { onlineAvailable: true }),
      createOrder(db, SAKURA, { ...base, aromaRecordId: "r3" }, { onlineAvailable: true }),
      createOrder(db, SAKURA, { ...base, volumeMl: 30 }, { onlineAvailable: true }),
      createOrder(db, SAKURA, { ...base, paymentMethod: "store" }, { onlineAvailable: true }),
      createOrder(db, SAKURA, { ...base, paymentMethod: "online" }, { onlineAvailable: false }),
    ]);
    assert.deepEqual(
      reasons.map((result) => (result.ok ? "ok" : result.reason)),
      ["not_found", "not_found", "invalid", "method", "method"],
    );
  });

  test("お届け先が無い人は注文できない", async () => {
    const result = await createOrder(
      db,
      REN,
      { aromaRecordId: "r3", volumeMl: 5, quantity: 1, paymentMethod: "bank", customerNote: "" },
      { onlineAvailable: false },
    );
    assert.equal(result.ok ? "ok" : result.reason, "no_address");
  });

  test("自分の注文だけが見え、支払いの知らせは支払いページの ID が合うときだけ効く", async () => {
    const result = await createOrder(
      db,
      SAKURA,
      { aromaRecordId: "r1", volumeMl: 10, quantity: 1, paymentMethod: "online", customerNote: "" },
      { onlineAvailable: true },
    );
    assert.ok(result.ok);
    if (!result.ok) return;
    await setPaymentRef(db, result.order.id, "cs_test_1");
    assert.equal(await markOrderPaid(db, result.order.id, "cs_other"), false);
    assert.equal(await markOrderPaid(db, result.order.id, "cs_test_1"), true);
    assert.equal((await findOwnOrder(db, SAKURA, result.order.id))?.paymentStatus, "paid");
    assert.equal(await findOwnOrder(db, REN, result.order.id), null);
    assert.equal((await listOwnOrders(db, SAKURA)).length, 2);
    assert.equal((await listOwnOrders(db, REN)).length, 0);
  });
});
