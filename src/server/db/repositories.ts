import {
  assertCanReadOperatorTable,
  assertOperator,
  buildAromaRecordScope,
  buildProfileScope,
  buildStoreCustomerScope,
  buildUserOwnedScope,
  isOperatorRole,
  selectWithScope,
  type Viewer,
} from "./access.ts";
import type { QueryRunner } from "./runner.ts";
import { recordAudit } from "./audit.ts";

/**
 * 画面から使うDB問い合わせはすべてここに集約する。
 * 画面側で直接SQLを書かないことで、権限の絞り込みの書き忘れを防ぐ。
 */

const PROFILE_COLUMNS = "id, user_id, customer_number, name, name_kana, birthday, avatar_url, role, favorite_types, frequent_times, last_visit_at, created_at";
const RECORD_COLUMNS = "id, user_id, title, subtitle, concept, mood, purpose, status, made_at, base_blend_id, base_blend_name, brainwave_image_id, blend_lot_number, reorder_url, price, volume";

export async function listProfiles(db: QueryRunner, viewer: Viewer) {
  const query = selectWithScope("profiles", PROFILE_COLUMNS, buildProfileScope(viewer), {
    orderBy: "customer_number",
  });
  return db.all(query.sql, query.params);
}

export async function findProfileByCustomerNumber(db: QueryRunner, viewer: Viewer, customerNumber: string) {
  const query = selectWithScope("profiles", PROFILE_COLUMNS, buildProfileScope(viewer), {
    extraSql: "customer_number = ?",
    extraParams: [customerNumber],
  });
  return db.first(query.sql, query.params);
}

export async function listAromaRecords(db: QueryRunner, viewer: Viewer, options: { userId?: string } = {}) {
  const query = selectWithScope("aroma_records", RECORD_COLUMNS, buildAromaRecordScope(viewer), {
    extraSql: options.userId ? "user_id = ?" : undefined,
    extraParams: options.userId ? [options.userId] : undefined,
    orderBy: "made_at desc",
  });
  return db.all(query.sql, query.params);
}

export async function findAromaRecord(db: QueryRunner, viewer: Viewer, id: string, reason?: string) {
  const query = selectWithScope("aroma_records", RECORD_COLUMNS, buildAromaRecordScope(viewer), {
    extraSql: "id = ?",
    extraParams: [id],
  });
  const row = await db.first<{ user_id: string }>(query.sql, query.params);
  // 本人が自分の記録を見た場合は記録しない。事業者が顧客の記録を開いた場合に残す。
  if (row && isOperatorRole(viewer)) {
    await recordAudit(db, viewer, {
      action: "view",
      targetTable: "aroma_records",
      targetId: id,
      subjectUserId: row.user_id,
      reason,
    });
  }
  return row;
}

/** 制作記録に紐づく材料。記録が見えない相手には材料も返さない。 */
export async function listIngredients(db: QueryRunner, viewer: Viewer, recordId: string) {
  const scope = buildAromaRecordScope(viewer, "r");
  return db.all(
    `select i.id, i.name, i.amount, i.unit, i.sort_order
       from aroma_ingredients i
       join aroma_records r on r.id = i.aroma_record_id
      where (${scope.sql}) and i.aroma_record_id = ?
      order by i.sort_order`,
    [...scope.params, recordId],
  );
}

/** 脳波画像。顧客本人は自分のものだけ、事業者は全件。 */
export async function listBrainwaveImages(db: QueryRunner, viewer: Viewer, userId: string) {
  const scope = buildUserOwnedScope(viewer, "b");
  return db.all(
    `select b.id, b.user_id, b.r2_key, b.title, b.note, b.measured_at, b.created_at
       from brainwave_images b
      where (${scope.sql}) and b.user_id = ?
      order by b.created_at desc`,
    [...scope.params, userId],
  );
}

/** 事前ヒアリング。健康・服薬情報を含むため事業者のみ。 */
export async function listHearingSheets(db: QueryRunner, viewer: Viewer, recordId: string, reason?: string) {
  assertCanReadOperatorTable(viewer, "hearing_sheets");
  const owner = await db.first<{ user_id: string }>(
    `select user_id from aroma_records where id = ?`, [recordId],
  );
  await recordAudit(db, viewer, {
    action: "view",
    targetTable: "hearing_sheets",
    targetId: recordId,
    subjectUserId: owner?.user_id ?? null,
    reason,
  });
  return db.all(
    `select id, user_id, source, submitted_at, name_kana, birthday, purpose_tags,
            desired_scent, preference_notes, health_notes, medication_notes, safety_flags, operator_summary
       from hearing_sheets where aroma_record_id = ?`,
    [recordId],
  );
}

/** 内部配合比率。顧客には出さない。 */
export async function findPrivateRecipe(db: QueryRunner, viewer: Viewer, baseBlendId: string, reason?: string) {
  assertCanReadOperatorTable(viewer, "base_blend_private_recipes");
  await recordAudit(db, viewer, {
    action: "view",
    targetTable: "base_blend_private_recipes",
    targetId: baseBlendId,
    reason,
  });
  return db.first(
    `select id, base_blend_id, internal_ratio, private_note
       from base_blend_private_recipes where base_blend_id = ?`,
    [baseBlendId],
  );
}

/** 図鑑データ。公開してよい情報のみを列に並べている。 */
export async function listBaseBlends(db: QueryRunner) {
  return db.all(
    `select id, code, name, description, public_ingredients, benefits, mood_slugs, color
       from base_blends order by code`,
    [],
  );
}

export async function listEssentialOils(db: QueryRunner) {
  return db.all(
    `select id, slug, name, botanical_name, family, scent_note, scent_profile, overview,
            common_uses, mood_slugs, blends_well_with, safety_note, color
       from essential_oils order by name`,
    [],
  );
}

export async function listMoodCategories(db: QueryRunner) {
  return db.all(`select id, slug, name, description, image_url, color, icon from mood_categories`, []);
}

/**
 * 顧客数。施術者は自店に来店した人だけ、管理者は全店を数える。
 * ダッシュボードの数字が一覧の件数と食い違わないよう、一覧と同じ絞り込みを使う。
 */
export async function countCustomers(db: QueryRunner, viewer: Viewer) {
  assertOperator(viewer);
  const scope = buildStoreCustomerScope(viewer, "p");
  const row = await db.first<{ c: number }>(
    `select count(*) as c from profiles p where (${scope.sql}) and p.role = 'customer'`,
    scope.params,
  );
  return row?.c ?? 0;
}

/**
 * 自店の顧客一覧。
 *
 * 施術者には「自分の店舗に来店した人」だけを返す。管理者には全店舗を返す。
 * 所属ではなく来店の事実で判定するため、他店で登録された常連客も、
 * 一度この店舗へ来ていれば同じ顧客番号のまま一覧に載る。
 *
 * 初来店でまだ来店記録が無い人はここには出ない。その場合は searchCustomers で
 * 名前や顧客番号から呼び出す(全店横断)。
 */
export async function listStoreCustomers(
  db: QueryRunner,
  viewer: Viewer,
  options: { limit?: number; reason?: string } = {},
) {
  assertOperator(viewer);

  await recordAudit(db, viewer, {
    action: "view",
    targetTable: "profiles",
    targetId: null,
    reason: options.reason ?? (viewer.role === "admin" ? "顧客一覧(全店)" : "顧客一覧(自店)"),
  });

  const scope = buildStoreCustomerScope(viewer, "p");
  return db.all(
    `select p.user_id, p.customer_number, p.name, p.name_kana, p.birthday,
            p.last_visit_at, s.name as store_name, s.store_code
       from profiles p
       left join stores s on s.id = p.store_id
      where (${scope.sql})
        and p.role = 'customer'
      order by (p.last_visit_at is null), p.last_visit_at desc, p.name
      limit ?`,
    [...scope.params, options.limit ?? 100],
  );
}

/**
 * 1人の来店履歴。どの店舗で何回受けたかを新しい順に返す。
 * 店舗をまたいでも同じ顧客番号で1本につながっていることを画面で示すために使う。
 */
export async function listVisits(db: QueryRunner, viewer: Viewer, userId: string) {
  assertOperator(viewer);
  return db.all(
    `select v.id, v.visited_at, v.note, v.staff_user_id, s.name as store_name, s.store_code
       from visits v
       left join stores s on s.id = v.store_id
      where v.user_id = ?
      order by v.visited_at desc`,
    [userId],
  );
}

/**
 * 顧客を呼び出すための検索。
 *
 * 一覧を常に画面へ出さず、担当者が名前などで引いて1名を特定する形にする。
 * 検索は全店横断が既定。店舗は絞り込みではなく、同姓同名を見分けるための
 * 表示項目として返す。店舗で絞り込むと他店で登録した常連客が出てこなくなる。
 *
 * 顧客情報へのアクセスにあたるため、事業者のみ実行でき、検索した事実を記録する。
 */
export async function searchCustomers(
  db: QueryRunner,
  viewer: Viewer,
  keyword: string,
  options: { limit?: number; reason?: string } = {},
) {
  assertOperator(viewer);

  const trimmed = keyword.trim();
  // 空文字で全件が返ると、一覧を出さない方針が崩れるため何も返さない
  if (trimmed === "") return [];

  await recordAudit(db, viewer, {
    action: "view",
    targetTable: "profiles",
    targetId: null,
    reason: options.reason ?? `顧客検索: ${trimmed}`,
  });

  const like = `%${trimmed}%`;
  return db.all(
    `select p.user_id, p.customer_number, p.name, p.name_kana, p.birthday,
            p.last_visit_at, s.name as store_name, s.store_code
       from profiles p
       left join stores s on s.id = p.store_id
      where p.role = 'customer'
        and (p.name like ? or p.name_kana like ? or p.customer_number like ?)
      order by (p.last_visit_at is null), p.last_visit_at desc, p.name
      limit ?`,
    [like, like, like, options.limit ?? 20],
  );
}
