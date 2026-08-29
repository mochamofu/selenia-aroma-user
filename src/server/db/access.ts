/**
 * D1にはPostgreSQLのRLS（行レベルセキュリティ）が無い。
 * そのため「他人のデータが返らない」保証をこのファイルで作る。
 *
 * 守るべき決まり:
 *   1. 画面(src/app/**)から直接SQLを書かない。必ずこのモジュール経由にする
 *   2. 顧客本人向けの取得は buildCustomerScope が返す条件を必ず付ける
 *   3. 事業者向けの取得は assertOperator を関数の入口で必ず呼ぶ
 *
 * 条件の組み立てをここに閉じ込めているため、呼び出し側が絞り込みを
 * 書き忘れても他人のデータが混ざらない。
 */

export type Viewer =
  | { role: "customer"; userId: string }
  | { role: "operator"; userId: string }
  | { role: "admin"; userId: string }
  | { role: "guest" };

export class AccessDeniedError extends Error {
  constructor(message = "この操作を行う権限がありません") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export type SqlCondition = { sql: string; params: unknown[] };

/** 結合したときに列名が衝突しないよう、表の別名を付ける。 */
function col(name: string, alias?: string) {
  return alias ? `${alias}.${name}` : name;
}

/** 事業者側（管理者・測定担当）かどうか。 */
export function isOperatorRole(viewer: Viewer): boolean {
  return viewer.role === "admin" || viewer.role === "operator";
}

/** 事業者専用の処理の入口で呼ぶ。権限がなければ例外を投げる。 */
export function assertOperator(viewer: Viewer): void {
  if (!isOperatorRole(viewer)) {
    throw new AccessDeniedError("事業者向けの情報です");
  }
}

/**
 * アロマ記録の絞り込み条件を作る。
 *
 * - 顧客本人: 自分の記録で、かつ公開済みのものだけ
 * - 事業者: 全件（下書きを含む）
 * - 未ログイン: 1件も返さない
 */
export function buildAromaRecordScope(viewer: Viewer, alias?: string): SqlCondition {
  if (isOperatorRole(viewer)) {
    return { sql: "1 = 1", params: [] };
  }
  if (viewer.role === "customer") {
    return { sql: `${col("user_id", alias)} = ? and ${col("status", alias)} = 'published'`, params: [viewer.userId] };
  }
  return { sql: "1 = 0", params: [] };
}

/**
 * user_id を持つ行に対する共通の絞り込み。脳波画像やお気に入りなど、
 * 「本人のものだけ見える」表に使う。
 */
export function buildUserOwnedScope(viewer: Viewer, alias?: string): SqlCondition {
  if (isOperatorRole(viewer)) {
    return { sql: "1 = 1", params: [] };
  }
  if (viewer.role === "customer") {
    return { sql: `${col("user_id", alias)} = ?`, params: [viewer.userId] };
  }
  return { sql: "1 = 0", params: [] };
}

/**
 * 顧客プロフィールの絞り込み条件を作る。
 *
 * - 顧客本人: 自分の1件だけ。他の顧客の氏名・顧客番号は返さない
 * - 事業者: 全件
 * - 未ログイン: 1件も返さない
 */
export function buildProfileScope(viewer: Viewer, alias?: string): SqlCondition {
  return buildUserOwnedScope(viewer, alias);
}

/**
 * 事業者しか触ってはいけないテーブル。
 * 顧客に見せてよい情報が1列も無いものをここに列挙する。
 */
export const OPERATOR_ONLY_TABLES = [
  "base_blend_private_recipes",
  "hearing_sheets",
] as const;

export type OperatorOnlyTable = (typeof OPERATOR_ONLY_TABLES)[number];

/** 事業者専用テーブルを読む前に必ず通す。 */
export function assertCanReadOperatorTable(viewer: Viewer, table: OperatorOnlyTable): void {
  if (!isOperatorRole(viewer)) {
    throw new AccessDeniedError(`${table} は事業者向けの情報です`);
  }
}

/**
 * 完成したSELECT文を組み立てる。
 * where句を呼び出し側に書かせず、必ずscopeを差し込む。
 */
export function selectWithScope(
  table: string,
  columns: string,
  scope: SqlCondition,
  options: { extraSql?: string; extraParams?: unknown[]; orderBy?: string; limit?: number } = {},
): SqlCondition {
  const parts = [`select ${columns} from ${table} where (${scope.sql})`];
  const params = [...scope.params];
  if (options.extraSql) {
    parts.push(`and (${options.extraSql})`);
    params.push(...(options.extraParams ?? []));
  }
  if (options.orderBy) parts.push(`order by ${options.orderBy}`);
  if (options.limit !== undefined) {
    parts.push("limit ?");
    params.push(options.limit);
  }
  return { sql: parts.join(" "), params };
}
