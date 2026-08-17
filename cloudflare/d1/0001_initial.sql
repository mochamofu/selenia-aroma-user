-- Cloudflare D1(SQLite)用の初期スキーマ
-- supabase/schema.sql から移植したもの。相違点は次の3つ。
--   1. uuid型がないため、IDはアプリ側で生成したtextを入れる
--   2. 配列型がないため、複数値はJSON文字列で持ち json_valid で検証する
--   3. RLSがないため、権限分離はアプリ層(src/server/db/)で行う

pragma foreign_keys = on;

-- 店舗台帳。顧客番号の先頭2桁に対応する。
create table if not exists stores (
  id text primary key,
  store_code text not null unique,
  name text not null,
  created_at text not null default (datetime('now')),
  check (length(store_code) = 2 and store_code glob '[0-9][0-9]')
);

create table if not exists profiles (
  id text primary key,
  user_id text not null unique,
  store_id text references stores(id) on delete set null,
  -- 顧客番号(カルテ番号): 店舗2桁 + 年度2桁 + 店舗内連番4桁
  customer_number text unique,
  name text not null,
  avatar_url text,
  role text not null default 'customer',
  favorite_types text not null default '[]',
  frequent_times text not null default '[]',
  created_at text not null default (datetime('now')),
  check (role in ('customer', 'admin', 'operator')),
  check (customer_number is null or (length(customer_number) = 8 and customer_number glob '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]')),
  check (json_valid(favorite_types) and json_valid(frequent_times))
);

create table if not exists base_blends (
  id text primary key,
  code text not null unique,
  name text not null,
  description text not null default '',
  public_ingredients text not null default '[]',
  benefits text not null default '[]',
  mood_slugs text not null default '[]',
  color text not null default '#B9A6D8',
  created_at text not null default (datetime('now')),
  check (json_valid(public_ingredients) and json_valid(benefits) and json_valid(mood_slugs))
);

-- 内部配合比率。顧客には出さない。事業者のみ参照する。
create table if not exists base_blend_private_recipes (
  id text primary key,
  base_blend_id text not null references base_blends(id) on delete cascade,
  internal_ratio text not null,
  private_note text not null default '',
  created_at text not null default (datetime('now'))
);

create table if not exists essential_oils (
  id text primary key,
  slug text not null unique,
  name text not null,
  botanical_name text not null default '',
  family text not null default '',
  scent_note text not null default '',
  scent_profile text not null default '',
  overview text not null default '',
  common_uses text not null default '[]',
  mood_slugs text not null default '[]',
  blends_well_with text not null default '[]',
  safety_note text not null default '',
  color text not null default '#B9A6D8',
  check (json_valid(common_uses) and json_valid(mood_slugs) and json_valid(blends_well_with))
);

create table if not exists mood_categories (
  id text primary key,
  slug text not null unique,
  name text not null,
  description text not null default '',
  image_url text,
  color text not null default '#B9A6D8',
  icon text not null default 'Sparkles'
);

-- 1分測定の脳波画像。実体はR2に置き、ここにはキーだけ持つ。
create table if not exists brainwave_images (
  id text primary key,
  user_id text not null references profiles(user_id) on delete cascade,
  r2_key text not null unique,
  title text not null default '',
  note text not null default '',
  measured_at text,
  created_at text not null default (datetime('now'))
);

create table if not exists aroma_records (
  id text primary key,
  user_id text not null references profiles(user_id) on delete cascade,
  brainwave_image_id text references brainwave_images(id) on delete set null,
  blend_lot_number text,
  base_blend_id text references base_blends(id) on delete set null,
  base_blend_name text,
  base_blend_volume_ml real,
  title text not null,
  subtitle text not null default '',
  concept text not null default '',
  mood text not null default '',
  purpose text not null default '',
  blend_notes text not null default '',
  usage_notes text not null default '',
  caution_notes text not null default '',
  maker_note text not null default '',
  total_volume_ml real,
  product_image_r2_key text,
  reorder_url text,
  price integer,
  volume text,
  -- published のときだけ購入者本人に見える
  status text not null default 'draft',
  made_at text not null,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  check (status in ('draft', 'published'))
);

create table if not exists aroma_ingredients (
  id text primary key,
  aroma_record_id text not null references aroma_records(id) on delete cascade,
  name text not null,
  amount text not null,
  unit text not null,
  sort_order integer not null default 0,
  check (unit in ('滴', 'ml', '%', 'uL'))
);

-- 事前ヒアリング。健康・服薬情報を含むため事業者のみ参照する。
create table if not exists hearing_sheets (
  id text primary key,
  aroma_record_id text references aroma_records(id) on delete cascade,
  user_id text not null references profiles(user_id) on delete cascade,
  source text not null default '手動入力',
  response_id text,
  submitted_at text,
  name_kana text not null default '',
  birthday text,
  purpose_tags text not null default '[]',
  desired_scent text not null default '',
  preference_notes text not null default '',
  health_notes text not null default '',
  medication_notes text not null default '',
  safety_flags text not null default '[]',
  operator_summary text not null default '',
  created_at text not null default (datetime('now')),
  check (json_valid(purpose_tags) and json_valid(safety_flags))
);

create table if not exists favorites (
  id text primary key,
  user_id text not null references profiles(user_id) on delete cascade,
  aroma_record_id text not null references aroma_records(id) on delete cascade,
  created_at text not null default (datetime('now')),
  unique (user_id, aroma_record_id)
);

create index if not exists idx_profiles_customer_number on profiles(customer_number);
create index if not exists idx_profiles_store on profiles(store_id);
create index if not exists idx_records_user_status on aroma_records(user_id, status, made_at);
create index if not exists idx_ingredients_record on aroma_ingredients(aroma_record_id, sort_order);
create index if not exists idx_images_user on brainwave_images(user_id, created_at);
create index if not exists idx_hearing_record on hearing_sheets(aroma_record_id);
create index if not exists idx_favorites_user on favorites(user_id, aroma_record_id);
