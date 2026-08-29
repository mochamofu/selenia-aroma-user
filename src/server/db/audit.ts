import type { Viewer } from "./access.ts";
import type { QueryRunner } from "./runner.ts";

/**
 * 閲覧・操作の記録。
 *
 * 電子カルテでは「誰がいつ誰のカルテを見たか」を残すのが前提になっている。
 * 当サービスは医療機関ではないが、持病や服薬といった健康情報を扱うため、
 * 同じ考え方を取り入れて後から確認できる状態にする。
 *
 * この記録は追記のみで、更新や削除は行わない。
 */

export type AuditAction = "view" | "create" | "update" | "delete" | "export" | "print";

export type AuditEntry = {
  action: AuditAction;
  targetTable: string;
  targetId?: string | null;
  /** 誰の情報だったか（顧客のuser_id） */
  subjectUserId?: string | null;
  /** 通常の担当範囲外を開いた場合などの理由 */
  reason?: string | null;
};

function newAuditId() {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function recordAudit(db: QueryRunner, viewer: Viewer, entry: AuditEntry): Promise<void> {
  // 未ログインの操作は記録対象の主体がないため残さない（そもそもデータも返らない）
  if (viewer.role === "guest") return;

  await db.run(
    `insert into audit_logs (id, actor_user_id, actor_role, action, target_table, target_id, subject_user_id, reason)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newAuditId(),
      viewer.userId,
      viewer.role,
      entry.action,
      entry.targetTable,
      entry.targetId ?? null,
      entry.subjectUserId ?? null,
      entry.reason ?? null,
    ],
  );
}

/** ある顧客の情報に誰が触れたかを新しい順に返す。本人への開示請求にも使える。 */
export async function listAuditForSubject(db: QueryRunner, subjectUserId: string, limit = 100) {
  return db.all(
    `select id, actor_user_id, actor_role, action, target_table, target_id, reason, created_at
       from audit_logs where subject_user_id = ? order by created_at desc limit ?`,
    [subjectUserId, limit],
  );
}
