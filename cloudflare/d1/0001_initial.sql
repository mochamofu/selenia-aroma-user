-- Cloudflare D1(SQLite)用の初期スキーマ
-- supabase/schema.sql から移植したもの。相違点は次の3つ。
--   1. uuid型がないため、IDはアプリ側で生成したtextを入れる
--   2. 配列型がないため、複数値はJSON文字列で持ち json_valid で検証する
--   3. RLSがないため、権限分離はアプリ層(src/server/db/)で行う

pragma foreign_keys = on;

-- 加盟店台帳。
--
-- 直営店ではなく、独立したサロンがオプションとして導入する前提で作る。
-- そのため店名・オーナー・連絡先は後から自由に変わる。変わらないのは
-- store_code(加入順の通し番号)だけ。
--
-- 閉店しても行は消さず status で表す。消すと、過去の施術番号がどこの店の
-- ものか分からなくなるため。store_code も再利用しない。
create table if not exists stores (
  id text primary key,
  -- 加入した順の通し番号 001〜999。一度発行したら変えない
  store_code text not null unique,
  -- 表に出す店名。いつでも変更してよい
  name text not null,
  -- 請求・手数料の宛先。店名とは別に持つ
  legal_name text not null default '',
  owner_name text not null default '',
  contact_email text not null default '',
  phone text not null default '',
  address text not null default '',
  status text not null default 'active',
  joined_at text not null default (datetime('now')),
  closed_at text,
  note text not null default '',
  created_at text not null default (datetime('now')),
  check (length(store_code) = 3 and store_code glob '[0-9][0-9][0-9]'),
  check (status in ('active', 'paused', 'closed'))
);

create table if not exists profiles (
  id text primary key,
  user_id text not null unique,
  store_id text references stores(id) on delete set null,
  -- 初めて受けた加盟店。手数料の配分先にもなる。
  -- 「どの店の顧客か」を番号ではなく列で持つのが要点。列なら間違いを直せるが、
  -- 番号に焼き込むと一生直せない。加盟店は閉店・改名・譲渡が起こる
  origin_store_id text references stores(id) on delete set null,
  -- 顧客番号(カルテ番号): 年度2桁 + 全加盟店で共通の通し番号5桁 = 7桁
  --   2600123 → 表示は 26-00123
  -- 店舗を含めない。人に一度だけ発行し、どの加盟店へ行っても同じ番号を使う
  customer_number text unique,
  name text not null,
  name_kana text not null default '',
  birthday text,
  avatar_url text,
  role text not null default 'customer',
  -- 最終来店日。顧客の呼び出しで新しい順に並べるために持つ
  last_visit_at text,
  favorite_types text not null default '[]',
  frequent_times text not null default '[]',
  created_at text not null default (datetime('now')),
  check (role in ('customer', 'admin', 'operator')),
  check (customer_number is null or (length(customer_number) = 7 and customer_number glob '[0-9][0-9][0-9][0-9][0-9][0-9][0-9]')),
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

-- 顧客の呼び出しは全店横断の検索を既定とする。
-- 顧客番号は「人」に一度だけ発行し、先頭2桁は初回登録した店舗を表すだけで
-- 所属先を固定しない。別の店舗へ来店しても同じ番号を使い履歴は1本につながる。
-- 店舗で絞り込むと他店で登録した常連客が出てこなくなるため、店舗は絞り込み条件
-- ではなく同姓同名を見分けるための表示項目として扱う。
create index if not exists idx_profiles_customer_number on profiles(customer_number);
create index if not exists idx_profiles_name on profiles(name);
create index if not exists idx_profiles_kana on profiles(name_kana);
create index if not exists idx_profiles_last_visit on profiles(last_visit_at);
create index if not exists idx_profiles_store on profiles(store_id);
create index if not exists idx_profiles_origin_store on profiles(origin_store_id);
create index if not exists idx_records_user_status on aroma_records(user_id, status, made_at);
create index if not exists idx_ingredients_record on aroma_ingredients(aroma_record_id, sort_order);
create index if not exists idx_images_user on brainwave_images(user_id, created_at);
create index if not exists idx_hearing_record on hearing_sheets(aroma_record_id);
create index if not exists idx_favorites_user on favorites(user_id, aroma_record_id);
