// src/data 配下の固定データから、D1へ投入するSQLを生成する。
// 使い方: node --experimental-strip-types --import ./scripts/register-alias.mjs scripts/generate-d1-seed.mjs
import { writeFileSync } from "node:fs";
import { operatorCustomers } from "../src/data/operatorCustomers.ts";
import { demoAromas, demoBaseBlends, demoMoods } from "../src/data/mockData.ts";
import { essentialOils } from "../src/data/essentialOils.ts";

const q = (v) => v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`;
const j = (v) => q(JSON.stringify(v ?? []));

const lines = [
  "-- 自動生成ファイル。直接編集せず scripts/generate-d1-seed.mjs を実行して作り直すこと。",
  "-- 生成元: src/data/operatorCustomers.ts, src/data/mockData.ts, src/data/essentialOils.ts",
  "",
  "delete from hearing_sheets; delete from aroma_ingredients; delete from favorites;",
  "delete from aroma_records; delete from brainwave_images;",
  "delete from base_blend_private_recipes; delete from base_blends;",
  "delete from essential_oils; delete from mood_categories;",
  "delete from profiles; delete from stores;",
  "",
  "-- 店舗台帳",
  `insert or ignore into stores (id, store_code, name) values ('store-ginza', '001', '銀座店');`,
  "",
  "-- 事業者側の顧客マスタ",
];

for (const p of operatorCustomers) {
  lines.push(
    `insert or ignore into profiles (id, user_id, store_id, origin_store_id, customer_number, name, name_kana, role, favorite_types, frequent_times, created_at) values (` +
    [q(p.id), q(p.user_id), q("store-ginza"), q("store-ginza"), q(p.customer_number), q(p.name), q(p.name_kana ?? ""), q(p.role),
     j(p.favorite_types), j(p.frequent_times), q(p.created_at)].join(", ") + `);`
  );
}

lines.push("", "-- ベースブレンド");
for (const b of demoBaseBlends) {
  lines.push(
    `insert or ignore into base_blends (id, code, name, description, public_ingredients, benefits, mood_slugs, color) values (` +
    [q(b.id), q(b.code), q(b.name), q(b.description), j(b.public_ingredients), j(b.benefits), j(b.mood_slugs), q(b.color)].join(", ") + `);`
  );
}

lines.push("", "-- 一般精油");
for (const o of essentialOils) {
  lines.push(
    `insert or ignore into essential_oils (id, slug, name, botanical_name, family, scent_note, scent_profile, overview, common_uses, mood_slugs, blends_well_with, safety_note, color) values (` +
    [q(o.id), q(o.slug), q(o.name), q(o.botanical_name), q(o.family), q(o.scent_note), q(o.scent_profile),
     q(o.overview), j(o.common_uses), j(o.mood_slugs), j(o.blends_well_with), q(o.safety_note), q(o.color)].join(", ") + `);`
  );
}

lines.push("", "-- 気分カテゴリ");
for (const m of demoMoods) {
  lines.push(
    `insert or ignore into mood_categories (id, slug, name, description, image_url, color, icon) values (` +
    [q(m.id), q(m.slug), q(m.name), q(m.description), q(m.image_url), q(m.color), q(m.icon)].join(", ") + `);`
  );
}

lines.push("");
// 制作記録は、参照先(base_blends)を入れたあとに投入する。
// 先に入れると外部キー制約で落ちる。
// 制作記録を、D1側の顧客へ割り当てる。
// 固定データは user-yuka などを使っているが、D1の顧客マスタは別のIDなので
// ここで対応づける。割り当て先が無いものは入れない。
const RECORD_OWNER = {
  "user-yuka": "user-sakura",
  "user-satoshi": "user-ren",
  "user-ayaka": "user-mika",
  "user-admin": "user-haruto",
};

lines.push("", "-- 制作記録（カルテ）");
for (const r of demoAromas) {
  const owner = RECORD_OWNER[r.user_id];
  if (!owner) continue;
  lines.push(
    `insert or ignore into aroma_records (id, user_id, blend_lot_number, base_blend_id, base_blend_name, base_blend_volume_ml, title, subtitle, concept, mood, purpose, blend_notes, usage_notes, caution_notes, total_volume_ml, reorder_url, price, volume, status, made_at) values (` +
    [q(r.id), q(owner), q(r.blend_lot_number), q(r.base_blend_id), q(r.base_blend_name),
     r.base_blend_volume_ml ?? "null", q(r.title), q(r.subtitle ?? ""), q(r.concept ?? ""),
     q(r.mood ?? ""), q(r.purpose ?? ""), q(r.blend_notes ?? ""), q(r.usage_notes ?? ""),
     q(r.caution_notes ?? ""), r.total_volume_ml ?? "null", q(r.reorder_url), r.price ?? "null",
     q(r.volume), q(r.status ?? "published"), q(r.made_at)].join(", ") + `);`
  );
  for (const i of r.ingredients ?? []) {
    lines.push(
      `insert or ignore into aroma_ingredients (id, aroma_record_id, name, amount, unit, sort_order) values (` +
      [q(i.id), q(r.id), q(i.name), q(i.amount), q(i.unit), i.sort_order ?? 0].join(", ") + `);`
    );
  }
}


writeFileSync(new URL("../cloudflare/d1/0002_seed.sql", import.meta.url), lines.join("\n"));
console.log(`顧客 ${operatorCustomers.length} / ベース ${demoBaseBlends.length} / 精油 ${essentialOils.length} / 気分 ${demoMoods.length}`);
