-- セレニアアロマ D1 スキーマ（まとめて実行用）
-- 0001_initial.sql + 0003_audit_consent.sql + 0004_store_scope.sql
-- PRAGMA文はD1が受け付けないため除いてある（外部キーはD1側で既定で有効）

-- ===== 0001_initial.sql =====
-- Cloudflare D1(SQLite)用の初期スキーマ
-- supabase/schema.sql から移植したもの。相違点は次の3つ。
--   1. uuid型がないため、IDはアプリ側で生成したtextを入れる
--   2. 配列型がないため、複数値はJSON文字列で持ち json_valid で検証する
--   3. RLSがないため、権限分離はアプリ層(src/server/db/)で行う


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

-- ===== 0003_audit_consent.sql =====
-- 電子カルテの運用に倣って、閲覧の記録と同意の記録を持つ。
--
-- 背景: 当サービスは医療機関ではないが、持病・服薬などの健康情報を扱う。
-- これらは個人情報保護法上の「要配慮個人情報」にあたり、取得には本人の同意が
-- 必要で、第三者提供のオプトアウトも認められていない。
-- 医療情報システムの考え方（誰がいつ何を見たかを残す、記録は消さず追記する）を
-- 部分的に取り入れ、後から確認できる状態にする。


-- 誰が、いつ、誰の、どの情報に触れたかの記録。
-- この表は追記のみとし、更新・削除はしない。
create table if not exists audit_logs (
  id text primary key,
  -- 操作した人
  actor_user_id text not null,
  actor_role text not null,
  -- 操作の内容
  action text not null,
  target_table text not null,
  target_id text,
  -- 誰の情報だったか（顧客）
  subject_user_id text,
  -- 通常の担当範囲外を開いた場合などの理由
  reason text,
  created_at text not null default (datetime('now')),
  check (action in ('view', 'create', 'update', 'delete', 'export', 'print'))
);

create index if not exists idx_audit_subject on audit_logs(subject_user_id, created_at);
create index if not exists idx_audit_actor on audit_logs(actor_user_id, created_at);
create index if not exists idx_audit_created on audit_logs(created_at);

-- 同意の記録。撤回された場合も行は消さず revoked_at を入れる。
create table if not exists consents (
  id text primary key,
  user_id text not null references profiles(user_id) on delete cascade,
  -- 何についての同意か
  consent_type text not null,
  granted integer not null default 1,
  -- 提示した説明文書の版。文面を変えたら版を上げる
  document_version text not null,
  -- 誰が対面で取得したか
  obtained_by text,
  obtained_at text not null,
  revoked_at text,
  note text not null default '',
  check (consent_type in ('measurement', 'data_use', 'image_storage', 'third_party')),
  check (granted in (0, 1))
);

create index if not exists idx_consents_user on consents(user_id, consent_type, obtained_at);

-- ===== 0004_store_scope.sql =====
-- 店舗ごとの見え方を決めるための追加。
--
-- 決めたこと:
--   1. 顧客番号は「人」に一度だけ発行する。店舗をまたいでも同じ番号を使う
--   2. 施術者は「自分の店舗に来店した人」だけが一覧に出る
--   3. 管理者(最高権限)は全店舗の顧客が見える
--   4. 検索は全店横断のまま。他店から来た常連を名前や番号で必ず引けるようにする
--
-- 2 を「所属店舗」で決めないのが要点。所属で決めると、銀座で登録した人が
-- 大阪へ来店したとき大阪の一覧に出てこない。来店した事実(visits)で決める。


-- 施術者がどの店舗に所属するか。1人が複数店舗を兼務することがあるため別表にする。
create table if not exists store_staff (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  user_id text not null references profiles(user_id) on delete cascade,
  created_at text not null default (datetime('now')),
  unique (store_id, user_id)
);

-- 来店(セッション)の記録。どの店舗で誰を測定したかを表す。
-- 「その店舗の顧客一覧」はこの表を根拠に作る。
create table if not exists visits (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  user_id text not null references profiles(user_id) on delete cascade,
  -- 担当した施術者。退職などで消えても来店記録は残す
  staff_user_id text references profiles(user_id) on delete set null,
  -- 施術番号: 日付6桁 + 加盟店3桁 + その日の連番2桁 = 11桁
  --   26090401001 → 表示は 260904-010-01
  -- ボトルに貼るロット番号を兼ねる。番号1つで「いつ・どこで・その日の何件目」
  -- が読め、DBを引けば誰のどのレシピかまでたどれる。
  -- 日付と店舗を焼き込んでよいのは、施術が起きてしまったできごとで、
  -- あとから日付も場所も変わらないため。顧客番号との違いはここにある。
  session_number text unique,
  visited_at text not null default (datetime('now')),
  note text not null default '',
  created_at text not null default (datetime('now')),
  check (session_number is null or (length(session_number) = 11 and session_number glob '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'))
);

-- 施術者の一覧引き(自店の顧客)で使う
create index if not exists idx_visits_store_user on visits(store_id, user_id);
create index if not exists idx_visits_store_date on visits(store_id, visited_at);
-- 1人の来店履歴を新しい順にたどる
create index if not exists idx_visits_user_date on visits(user_id, visited_at);
create index if not exists idx_store_staff_user on store_staff(user_id);
-- その日・その店舗で何件目かを採番するために引く
create index if not exists idx_visits_store_day on visits(store_id, substr(visited_at, 1, 10));
