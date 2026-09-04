import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildCustomerNumber,
  buildSessionNumber,
  buildStoreCode,
  describeCustomerNumber,
  describeSessionNumber,
  formatCustomerNumber,
  formatSessionNumber,
  isValidCustomerNumber,
  isValidSessionNumber,
  isValidStoreCode,
  normalizeNumber,
  parseCustomerNumber,
  parseSessionNumber,
} from "./customerNumber.ts";

describe("加盟店コード", () => {
  test("加入順の3桁になる", () => {
    assert.equal(buildStoreCode(1), "001");
    assert.equal(buildStoreCode(10), "010");
    assert.equal(buildStoreCode(999), "999");
  });

  test("範囲外は作れない", () => {
    assert.throws(() => buildStoreCode(0));
    assert.throws(() => buildStoreCode(1000));
    assert.throws(() => buildStoreCode(1.5));
  });

  test("000は使わない", () => {
    assert.equal(isValidStoreCode("000"), false);
    assert.equal(isValidStoreCode("001"), true);
    assert.equal(isValidStoreCode("01"), false);
  });
});

describe("顧客番号（人に一度だけ発行する）", () => {
  test("年度2桁 + 通し5桁 の7桁になる", () => {
    assert.equal(buildCustomerNumber({ year: 2026, serial: 1 }), "2600001");
    assert.equal(buildCustomerNumber({ year: 2026, serial: 123 }), "2600123");
    assert.equal(buildCustomerNumber({ year: 2027, serial: 99999 }), "2799999");
  });

  test("表示は CLT- を付ける", () => {
    assert.equal(formatCustomerNumber("2600123"), "CLT-2600123");
  });

  test("番号から年度と何人目かが読める", () => {
    assert.equal(describeCustomerNumber("2600123"), "2026年度 / 123人目");
  });

  test("加盟店は番号に含まれない", () => {
    // 同じ通し番号なら、どの加盟店で発行しても同じ番号になる。
    // 「どの店で初めて受けたか」は profiles.origin_store_id という列で持つ。
    const parts = parseCustomerNumber("2600123");
    assert.deepEqual(parts, { fiscalYear: "26", serial: "00123" });
    assert.equal(Object.keys(parts ?? {}).includes("storeCode"), false);
  });

  test("桁数が違うものは受け付けない", () => {
    assert.equal(isValidCustomerNumber("01260051"), false, "旧8桁");
    assert.equal(isValidCustomerNumber("260012"), false, "6桁");
    assert.equal(isValidCustomerNumber("26001234"), false, "8桁");
    assert.equal(isValidCustomerNumber("26-0012a"), false, "数字以外");
  });

  test("範囲外の通し番号は作れない", () => {
    assert.throws(() => buildCustomerNumber({ year: 2026, serial: 0 }));
    assert.throws(() => buildCustomerNumber({ year: 2026, serial: 100000 }));
  });
});

describe("施術番号（1回の測定+調香に発行する）", () => {
  const date = new Date(2026, 8, 4); // 2026-09-04

  test("日付6桁 + 加盟店3桁 + その日の連番2桁 の11桁になる", () => {
    assert.equal(buildSessionNumber({ date, storeCode: "010", dailySerial: 1 }), "26090401001");
  });

  test("表示は LOT- を付けてハイフンで区切る", () => {
    assert.equal(formatSessionNumber("26090401001"), "LOT-260904-010-01");
  });

  test("番号だけで いつ・どこで・その日の何件目か が読める", () => {
    assert.equal(
      describeSessionNumber("26090401001", "新宿サロン"),
      "2026年9月4日 / 新宿サロン / 1件目",
    );
    assert.deepEqual(parseSessionNumber("26090401001"), {
      date: "260904",
      storeCode: "010",
      dailySerial: "01",
    });
  });

  test("同じ日・同じ店でも連番で重ならない", () => {
    const a = buildSessionNumber({ date, storeCode: "010", dailySerial: 1 });
    const b = buildSessionNumber({ date, storeCode: "010", dailySerial: 2 });
    assert.notEqual(a, b);
  });

  test("同じ日・同じ連番でも店が違えば重ならない", () => {
    const a = buildSessionNumber({ date, storeCode: "010", dailySerial: 1 });
    const b = buildSessionNumber({ date, storeCode: "011", dailySerial: 1 });
    assert.notEqual(a, b);
  });

  test("不正な加盟店コードや連番は弾く", () => {
    assert.throws(() => buildSessionNumber({ date, storeCode: "10", dailySerial: 1 }));
    assert.throws(() => buildSessionNumber({ date, storeCode: "010", dailySerial: 0 }));
    assert.throws(() => buildSessionNumber({ date, storeCode: "010", dailySerial: 100 }));
    assert.equal(isValidSessionNumber("2609040100"), false, "10桁");
  });
});

describe("顧客番号と施術番号は別物", () => {
  test("桁数が違うので取り違えても弾かれる", () => {
    const customer = buildCustomerNumber({ year: 2026, serial: 123 });
    const session = buildSessionNumber({ date: new Date(2026, 8, 4), storeCode: "010", dailySerial: 1 });
    assert.equal(isValidSessionNumber(customer), false);
    assert.equal(isValidCustomerNumber(session), false);
  });

  test("同じ人が別の日・別の店で受けても顧客番号は変わらない", () => {
    // 顧客番号は人に一度だけ発行するので、来店のたびに作り直さない。
    // 変わるのは施術番号のほう。
    const customer = buildCustomerNumber({ year: 2026, serial: 123 });
    const ginza = buildSessionNumber({ date: new Date(2026, 2, 1), storeCode: "001", dailySerial: 1 });
    const shinjuku = buildSessionNumber({ date: new Date(2026, 8, 4), storeCode: "010", dailySerial: 3 });
    assert.equal(customer, "2600123");
    assert.notEqual(ginza, shinjuku);
    assert.equal(parseSessionNumber(ginza)?.storeCode, "001");
    assert.equal(parseSessionNumber(shinjuku)?.storeCode, "010");
  });
});

describe("接頭辞で2つの番号を見分ける", () => {
  test("CLT と LOT で、数字を読まなくても種類が分かる", () => {
    const customer = formatCustomerNumber(buildCustomerNumber({ year: 2026, serial: 123 }));
    const session = formatSessionNumber(
      buildSessionNumber({ date: new Date(2026, 8, 4), storeCode: "010", dailySerial: 1 }),
    );
    assert.equal(customer, "CLT-2600123");
    assert.equal(session, "LOT-260904-010-01");
    assert.ok(customer?.startsWith("CLT-"));
    assert.ok(session?.startsWith("LOT-"));
  });
});

describe("入力のゆらぎ", () => {
  test("ハイフン・空白・全角数字を吸収する", () => {
    assert.equal(normalizeNumber("26-00123"), "2600123");
    assert.equal(normalizeNumber(" 2600123 "), "2600123");
    assert.equal(normalizeNumber("２６００１２３"), "2600123");
    assert.equal(normalizeNumber("260904-010-01"), "26090401001");
  });

  test("接頭辞を付けて打っても、付けずに打っても同じ番号になる", () => {
    assert.equal(normalizeNumber("CLT-2600123"), "2600123");
    assert.equal(normalizeNumber("CLT2600123"), "2600123", "ハイフンなし");
    assert.equal(normalizeNumber("clt-2600123"), "2600123", "小文字");
    assert.equal(normalizeNumber("ＣＬＴ-２６００１２３"), "2600123", "全角");
    assert.equal(normalizeNumber("LOT-260904-010-01"), "26090401001");
  });

  test("表示形のまま入れても有効と判定される", () => {
    assert.equal(isValidCustomerNumber("CLT-2600123"), true);
    assert.equal(isValidCustomerNumber("26-00123"), true);
    assert.equal(isValidSessionNumber("LOT-260904-010-01"), true);
    assert.equal(isValidSessionNumber("260904-010-01"), true);
  });

  test("接頭辞が付いていても取り違えは弾かれる", () => {
    // CLT- を付けても中身が11桁なら顧客番号としては通さない
    assert.equal(isValidCustomerNumber("CLT-260904-010-01"), false);
    assert.equal(isValidSessionNumber("LOT-2600123"), false);
  });

  test("ゆらぎを吸収したうえで解釈できる", () => {
    assert.equal(describeCustomerNumber("２６-００１２３"), "2026年度 / 123人目");
    assert.equal(describeCustomerNumber("CLT-2600123"), "2026年度 / 123人目");
  });
});
