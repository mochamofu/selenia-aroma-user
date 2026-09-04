-- サーバ側の認証。
--
-- なぜ必要か:
--   D1にはRLSが無く、権限の判定はアプリ層で行う。その判定の入口になる
--   「いま誰が見ているか」を、画面から渡された値ではなくサーバ側で決める
--   必要がある。画面から送られたユーザーIDを信じると、他人のIDを送るだけで
--   他人のカルテが読めてしまう。
--
-- 設計:
--   1. パスワードは PBKDF2-SHA256 で伸長して保存する。元の文字列は保存しない
--   2. セッションはランダムな token をブラウザのCookieに置き、DBには token の
--      ハッシュだけを保存する。DBが漏れても、そこからセッションを乗っ取れない
--   3. Cookieは HttpOnly。画面のJavaScriptから読めないため、XSSがあっても
--      セッションを盗み出せない
--
-- 詳しい根拠は docs/authentication.md を参照。

-- ログインに使う資格情報。profiles と1対1で紐づく。
-- profiles と分けているのは、氏名などの表示用の情報と、パスワードのような
-- 秘密情報を同じ表に置かないため。取得のたびに秘密情報が付いてこない。
create table if not exists credentials (
  id text primary key,
  user_id text not null unique references profiles(user_id) on delete cascade,
  -- ログインID。メールアドレスを想定するが、形式は縛らない
  login_id text not null unique,
  -- PBKDF2-SHA256 の結果。'pbkdf2$<繰り返し回数>$<salt>$<hash>' の形で入れる
  password_hash text not null,
  -- 連続で失敗した回数。総当たりを遅くするために使う
  failed_attempts integer not null default 0,
  -- この時刻まではログインを受け付けない
  locked_until text,
  last_login_at text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

-- ログイン中のセッション。
-- token そのものは保存しない。保存するのはSHA-256のハッシュ。
create table if not exists sessions (
  id text primary key,
  user_id text not null references profiles(user_id) on delete cascade,
  -- Cookieに入れた token の SHA-256。ここから元の token は復元できない
  token_hash text not null unique,
  -- 施術者がどの店舗として操作しているか。顧客一覧の絞り込みに使う
  store_id text references stores(id) on delete set null,
  expires_at text not null,
  created_at text not null default (datetime('now')),
  last_seen_at text not null default (datetime('now')),
  -- 監査のために残す。個人を特定する目的では使わない
  user_agent text not null default ''
);

create index if not exists idx_sessions_user on sessions(user_id);
create index if not exists idx_sessions_expires on sessions(expires_at);
create index if not exists idx_credentials_login on credentials(login_id);
