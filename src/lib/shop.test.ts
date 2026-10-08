import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isShippable,
  makeOrderNumber,
  normalizePostalCode,
  normalizeShopSettings,
  quoteOrder,
  validateContact,
} from "./shop.ts";

describe("再注文の金額", () => {
  const settings = normalizeShopSettings({
    priceList: [{ volumeMl: 10, price: "5,500" }, { volumeMl: 5, price: 3300 }],
    shippingFee: 500,
    freeShippingOver: 6000,
  });

  test("価格表は容量の小さい順", () => {
    assert.deepEqual(settings.priceList.map((item) => item.volumeMl), [5, 10]);
  });

  test("送料を足し、決めた金額以上なら無料", () => {
    assert.deepEqual(quoteOrder(settings, 5, 1), { unitPrice: 3300, subtotal: 3300, shippingFee: 500, total: 3800 });
    assert.equal(quoteOrder(settings, 5, 2)?.shippingFee, 0);
  });

  test("価格表に無い容量・おかしな本数は受けない", () => {
    assert.equal(quoteOrder(settings, 30, 1), null);
    assert.equal(quoteOrder(settings, 5, 0), null);
    assert.equal(quoteOrder(settings, 5, 21), null);
  });
});

describe("注文番号とお届け先", () => {
  test("注文番号は日本時間の日付と4文字", () => {
    assert.equal(makeOrderNumber(new Date("2026-10-07T16:00:00Z"), () => 0), "SA-261008-2222");
  });

  test("郵便番号は全角でも 123-4567 にそろえる", () => {
    assert.equal(normalizePostalCode("１２３４５６７"), "123-4567");
    assert.equal(normalizePostalCode("123"), null);
  });

  test("郵便番号・住所・電話がそろえば発送できる", () => {
    const result = validateContact({ postalCode: "1234567", address1: "東京都", phone: "09012345678" });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(isShippable(result.value), true);
    assert.equal(validateContact({ phone: "12" }).ok, false);
  });
});
