// src/data 配下の固定データから、D1へ投入するSQLを生成する。
// 使い方: node --experimental-strip-types --import ./scripts/register-alias.mjs scripts/generate-d1-seed.mjs
import { writeFileSync } from "node:fs";
import { operatorCustomers } from "../src/data/operatorCustomers.ts";
import { demoBaseBlends, demoMoods } from "../src/data/mockData.ts";
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
  `insert into stores (id, store_code, name) values ('store-ginza', '01', '銀座店');`,
  "",
  "-- 事業者側の顧客マスタ",
];

for (const p of operatorCustomers) {
  lines.push(
    `insert into profiles (id, user_id, store_id, customer_number, name, name_kana, role, favorite_types, frequent_times, created_at) values (` +
    [q(p.id), q(p.user_id), q("store-ginza"), q(p.customer_number), q(p.name), q(p.name_kana ?? ""), q(p.role),
     j(p.favorite_types), j(p.frequent_times), q(p.created_at)].join(", ") + `);`
  );
}

lines.push("", "-- ベースブレンド");
for (const b of demoBaseBlends) {
  lines.push(
    `insert into base_blends (id, code, name, description, public_ingredients, benefits, mood_slugs, color) values (` +
    [q(b.id), q(b.code), q(b.name), q(b.description), j(b.public_ingredients), j(b.benefits), j(b.mood_slugs), q(b.color)].join(", ") + `);`
  );
}

lines.push("", "-- 一般精油");
for (const o of essentialOils) {
  lines.push(
    `insert into essential_oils (id, slug, name, botanical_name, family, scent_note, scent_profile, overview, common_uses, mood_slugs, blends_well_with, safety_note, color) values (` +
    [q(o.id), q(o.slug), q(o.name), q(o.botanical_name), q(o.family), q(o.scent_note), q(o.scent_profile),
     q(o.overview), j(o.common_uses), j(o.mood_slugs), j(o.blends_well_with), q(o.safety_note), q(o.color)].join(", ") + `);`
  );
}

lines.push("", "-- 気分カテゴリ");
for (const m of demoMoods) {
  lines.push(
    `insert into mood_categories (id, slug, name, description, image_url, color, icon) values (` +
    [q(m.id), q(m.slug), q(m.name), q(m.description), q(m.image_url), q(m.color), q(m.icon)].join(", ") + `);`
  );
}

lines.push("");
writeFileSync(new URL("../cloudflare/d1/0002_seed.sql", import.meta.url), lines.join("\n"));
console.log(`顧客 ${operatorCustomers.length} / ベース ${demoBaseBlends.length} / 精油 ${essentialOils.length} / 気分 ${demoMoods.length}`);
