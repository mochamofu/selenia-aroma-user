-- 運営者アプリ（selenia-aroma-master）の db/migrations/0013_shop_orders.sql の写し。
-- 本番へはそちらの「Apply D1 migration」で流す。ここはテストと手元の確認用（何度流しても同じ結果になる）。
-- 変えるときは両方を直す。

-- 再注文のための表。お届け先・連絡先、ショップの設定、注文。
--
-- お届け先（client_contacts）は個人情報。次の決まりで扱う。
--   - 本人の同意を受けた記録（consent_obtained_at）が無いうちは、住所などを入れない
--   - 参考メモ（AI）・レポート・バックアップには出さない
--   - 見られるのは施術者と、お客様本人だけ
-- 同意書の正式な文面はこれから作る。文面を変えたら consent_version を上げる。

CREATE TABLE IF NOT EXISTS client_contacts (
  user_id             text primary key references profiles(user_id) on delete cascade,
  -- 送り先の名前。カルテの名前と違うとき（贈り物・旧姓など）だけ入れる。空ならカルテの名前
  ship_name           text not null default '',
  postal_code         text not null default '',
  -- 都道府県・市区町村・番地
  address1            text not null default '',
  -- 建物名・部屋番号
  address2            text not null default '',
  phone               text not null default '',
  email               text not null default '',
  -- 同意。null なら未取得。in_person は来店時に施術者が、online はお客様がアプリで
  consent_obtained_at text,
  consent_version     text not null default '',
  consent_method      text not null default '',
  consent_obtained_by text,
  updated_by          text,
  updated_at          text not null default (datetime('now')),
  check (consent_method in ('', 'in_person', 'online'))
);

-- ショップの設定。行は1つだけ（id = 'default'）。値は設定画面から入れる。
--   price_list: [{"volumeMl": 5, "price": 3300}, ...] 税込の円
CREATE TABLE IF NOT EXISTS shop_settings (
  id                     text primary key,
  price_list             text not null default '[]',
  shipping_fee           integer not null default 0,
  -- この金額以上で送料無料。null なら送料無料なし
  free_shipping_over     integer,
  accept_online          integer not null default 0,
  accept_bank            integer not null default 1,
  accept_store           integer not null default 1,
  -- 振込先など、お客様に出す案内文
  bank_transfer_note     text not null default '',
  -- 注文が入ったことを知らせる先
  notify_email           text not null default '',
  updated_by             text,
  updated_at             text not null default (datetime('now')),
  check (accept_online in (0, 1)),
  check (accept_bank in (0, 1)),
  check (accept_store in (0, 1))
);

-- 注文。中身と届け先は注文した時点の写しを持つ（あとでカルテや住所を直しても注文は変わらない）。
--   status:         requested 受付 → making 作成中 → shipped 発送済み（cancelled 取り消し）
--   payment_method: online（カード・PayPay など。決済サービス経由）/ bank 振込 / store 来店時
--   payment_status: unpaid → paid（refunded 返金）
CREATE TABLE IF NOT EXISTS orders (
  id                 text primary key,
  order_number       text not null unique,
  user_id            text not null references profiles(user_id) on delete cascade,
  aroma_record_id    text references aroma_records(id) on delete set null,
  aroma_title        text not null,
  base_blend_name    text not null default '',
  volume_ml          real not null,
  quantity           integer not null,
  unit_price         integer not null,
  shipping_fee       integer not null default 0,
  total              integer not null,
  status             text not null default 'requested',
  payment_method     text not null,
  payment_status     text not null default 'unpaid',
  -- 決済サービスの支払いの ID（Stripe の Checkout Session など）
  payment_ref        text,
  ship_name          text not null default '',
  ship_postal_code   text not null default '',
  ship_address1      text not null default '',
  ship_address2      text not null default '',
  ship_phone         text not null default '',
  customer_note      text not null default '',
  operator_note      text not null default '',
  lot_number         text not null default '',
  tracking_number    text not null default '',
  created_at         text not null default (datetime('now')),
  updated_at         text not null default (datetime('now')),
  paid_at            text,
  shipped_at         text,
  check (status in ('requested', 'making', 'shipped', 'cancelled')),
  check (payment_method in ('online', 'bank', 'store')),
  check (payment_status in ('unpaid', 'paid', 'refunded')),
  check (quantity between 1 and 20)
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
