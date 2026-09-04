-- 電子カルテの運用に倣って、閲覧の記録と同意の記録を持つ。
--
-- 背景: 当サービスは医療機関ではないが、持病・服薬などの健康情報を扱う。
-- これらは個人情報保護法上の「要配慮個人情報」にあたり、取得には本人の同意が
-- 必要で、第三者提供のオプトアウトも認められていない。
-- 医療情報システムの考え方（誰がいつ何を見たかを残す、記録は消さず追記する）を
-- 部分的に取り入れ、後から確認できる状態にする。

pragma foreign_keys = on;

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
