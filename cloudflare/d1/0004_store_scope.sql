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

pragma foreign_keys = on;

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
