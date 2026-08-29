import {
  assertCanReadOperatorTable,
  assertOperator,
  buildAromaRecordScope,
  buildProfileScope,
  buildUserOwnedScope,
  selectWithScope,
  type Viewer,
} from "./access.ts";
import type { QueryRunner } from "./runner.ts";

/**
 * 画面から使うDB問い合わせはすべてここに集約する。
 * 画面側で直接SQLを書かないことで、権限の絞り込みの書き忘れを防ぐ。
 */

const PROFILE_COLUMNS = "id, user_id, customer_number, name, avatar_url, role, favorite_types, frequent_times, created_at";
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

export async function findAromaRecord(db: QueryRunner, viewer: Viewer, id: string) {
  const query = selectWithScope("aroma_records", RECORD_COLUMNS, buildAromaRecordScope(viewer), {
    extraSql: "id = ?",
    extraParams: [id],
  });
  return db.first(query.sql, query.params);
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
export async function listHearingSheets(db: QueryRunner, viewer: Viewer, recordId: string) {
  assertCanReadOperatorTable(viewer, "hearing_sheets");
  return db.all(
    `select id, user_id, source, submitted_at, name_kana, birthday, purpose_tags,
            desired_scent, preference_notes, health_notes, medication_notes, safety_flags, operator_summary
       from hearing_sheets where aroma_record_id = ?`,
    [recordId],
  );
}

/** 内部配合比率。顧客には出さない。 */
export async function findPrivateRecipe(db: QueryRunner, viewer: Viewer, baseBlendId: string) {
  assertCanReadOperatorTable(viewer, "base_blend_private_recipes");
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

/** 顧客数などの集計。事業者のみ。 */
export async function countCustomers(db: QueryRunner, viewer: Viewer) {
  assertOperator(viewer);
  const row = await db.first<{ c: number }>(`select count(*) as c from profiles where role = 'customer'`, []);
  return row?.c ?? 0;
}
