/**
 * 番号の付け方。
 *
 * 「人」と「できごと」で番号を分ける。ここが設計の要点。
 *
 *   顧客番号 (customer number) … 人に一度だけ発行する。一生変わらない
 *     表示 CLT-2600123        (CLienT)
 *   施術番号 (session number)  … 1回の測定+調香に発行する。二度と変わらない
 *     表示 LOT-260904-010-01  (ボトルのロット番号を兼ねる)
 *
 * DBには数字だけ(7桁 / 11桁)を入れ、画面や紙には接頭辞を付けて出す。
 * 数字だけを2種類並べると、作った本人以外には見分けがつかないため。
 * 入力はどちらの形でも受け付ける(normalizeNumber が接頭辞を落とす)。
 *
 * 混ぜてはいけない理由:
 *   - 顧客番号に日付を入れると、同じ人が来店のたびに別番号になる
 *   - 顧客番号に「何回目」を入れると、来店の取り消しや記録漏れの修正で
 *     以降の番号が全部ずれる。回数は数えて出すもので、番号に焼き込まない
 *   - 顧客番号に加盟店を入れると、その店が閉店・改名・譲渡されたあとも
 *     番号だけが古い店を指し続ける
 *
 * 詳しい根拠は docs/numbering-design.md を参照。
 */

// ---------------------------------------------------------------------------
// 加盟店コード
// ---------------------------------------------------------------------------

/**
 * 加盟店コードは「加入した順の通し番号」3桁。001〜999。
 *
 * 店名・住所・オーナーは stores テーブルの列として持ち、いつでも変更できる。
 * コードのほうは一度発行したら変えない。閉店しても欠番のまま再利用しない。
 * (再利用すると、過去の施術番号が別の店を指してしまう)
 *
 * 直営店ではなく独立したサロンが導入するため、店名は頻繁に変わりうる。
 * 「番号は変えない、名前は自由に変える」で切り分ける。
 */
const STORE_CODE_PATTERN = /^\d{3}$/;

export function isValidStoreCode(value: string): boolean {
  return STORE_CODE_PATTERN.test(value) && value !== "000";
}

export function buildStoreCode(joinOrder: number): string {
  if (!Number.isInteger(joinOrder) || joinOrder < 1 || joinOrder > 999) {
    throw new Error("加盟店コードは1〜999の範囲で指定してください");
  }
  return String(joinOrder).padStart(3, "0");
}

// ---------------------------------------------------------------------------
// 顧客番号 — 人に一度だけ発行する
// ---------------------------------------------------------------------------

/**
 * 顧客番号は 年度2桁 + 通し番号5桁 = 7桁。
 *
 *   2600123  →  表示は CLT-2600123
 *
 * 通し番号は全加盟店で共通の連番。店舗ごとに採番しないため、
 * 別の店舗で2つ目の番号が発行される事故が起きない。
 *
 * 加盟店を番号に含めないのは意図的。「どの店で初めて受けたか」は
 * profiles.origin_store_id という列で持つ。列なら間違えても直せるが、
 * 番号に焼き込むと一生直せない。
 */
const CUSTOMER_NUMBER_PATTERN = /^\d{7}$/;

export type CustomerNumberParts = {
  /** 年度の下2桁 */
  fiscalYear: string;
  /** 全店共通の通し番号 */
  serial: string;
};

export function isValidCustomerNumber(value: string): boolean {
  return CUSTOMER_NUMBER_PATTERN.test(normalizeNumber(value));
}

export function buildCustomerNumber({ year, serial }: { year: number; serial: number }): string {
  if (!Number.isInteger(serial) || serial < 1 || serial > 99999) {
    throw new Error("顧客番号の通し番号は1〜99999の範囲で指定してください");
  }
  const fiscalYear = String(year % 100).padStart(2, "0");
  return `${fiscalYear}${String(serial).padStart(5, "0")}`;
}

export function parseCustomerNumber(value: string): CustomerNumberParts | null {
  const raw = normalizeNumber(value);
  if (!isValidCustomerNumber(raw)) return null;
  return { fiscalYear: raw.slice(0, 2), serial: raw.slice(2, 7) };
}

/** 顧客番号の接頭辞。CLienT。施術番号と見分けるために付ける。 */
export const CUSTOMER_NUMBER_PREFIX = "CLT";

/** 画面や紙に出すときの表記。CLT-2600123 */
export function formatCustomerNumber(value: string): string | null {
  const parts = parseCustomerNumber(value);
  if (!parts) return null;
  return `${CUSTOMER_NUMBER_PREFIX}-${parts.fiscalYear}${parts.serial}`;
}

export function describeCustomerNumber(value: string): string | null {
  const parts = parseCustomerNumber(value);
  if (!parts) return null;
  return `20${parts.fiscalYear}年度 / ${Number(parts.serial)}人目`;
}

// ---------------------------------------------------------------------------
// 施術番号 — 1回の測定+調香に発行する。ボトルのロット番号としても使う
// ---------------------------------------------------------------------------

/**
 * 施術番号は 日付6桁 + 加盟店3桁 + その日の連番2桁 = 11桁。
 *
 *   260904 010 01  →  表示は LOT-260904-010-01
 *   (2026年9月4日 / 加盟店010 / その日の1件目)
 *
 * これはボトルに貼るロット番号を兼ねる。番号1つで
 * 「いつ・どこで・その日の何件目か」が読め、DBを引けば
 * 誰のどのレシピかまで一意にたどれる。
 *
 * 日付と店舗を含めてよいのは、施術が「起きてしまったできごと」だから。
 * あとから日付や場所が変わることはない。顧客番号との違いはここにある。
 */
const SESSION_NUMBER_PATTERN = /^\d{11}$/;

export type SessionNumberParts = {
  /** YYMMDD */
  date: string;
  storeCode: string;
  /** その店舗のその日の連番 */
  dailySerial: string;
};

export function isValidSessionNumber(value: string): boolean {
  return SESSION_NUMBER_PATTERN.test(normalizeNumber(value));
}

export function buildSessionNumber({
  date,
  storeCode,
  dailySerial,
}: {
  /** 施術日。時刻は使わない */
  date: Date;
  storeCode: string;
  dailySerial: number;
}): string {
  if (!isValidStoreCode(storeCode)) throw new Error("加盟店コードは001〜999で指定してください");
  if (!Number.isInteger(dailySerial) || dailySerial < 1 || dailySerial > 99) {
    throw new Error("その日の連番は1〜99の範囲で指定してください");
  }
  const yy = String(date.getFullYear() % 100).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}${storeCode}${String(dailySerial).padStart(2, "0")}`;
}

export function parseSessionNumber(value: string): SessionNumberParts | null {
  const raw = normalizeNumber(value);
  if (!isValidSessionNumber(raw)) return null;
  return { date: raw.slice(0, 6), storeCode: raw.slice(6, 9), dailySerial: raw.slice(9, 11) };
}

/** 施術番号の接頭辞。ボトルのロット番号を兼ねるため LOT。 */
export const SESSION_NUMBER_PREFIX = "LOT";

/** 画面や紙に出すときの表記。LOT-260904-010-01 */
export function formatSessionNumber(value: string): string | null {
  const parts = parseSessionNumber(value);
  if (!parts) return null;
  return `${SESSION_NUMBER_PREFIX}-${parts.date}-${parts.storeCode}-${parts.dailySerial}`;
}

export function describeSessionNumber(value: string, storeName?: string): string | null {
  const parts = parseSessionNumber(value);
  if (!parts) return null;
  const y = `20${parts.date.slice(0, 2)}`;
  const m = Number(parts.date.slice(2, 4));
  const d = Number(parts.date.slice(4, 6));
  const store = storeName ?? `加盟店${parts.storeCode}`;
  return `${y}年${m}月${d}日 / ${store} / ${Number(parts.dailySerial)}件目`;
}

// ---------------------------------------------------------------------------

/**
 * 入力のゆらぎを吸収して、DBに入っている数字だけの形にする。
 *
 * 落とすもの: 接頭辞(CLT / LOT)、ハイフン、空白、全角の数字と英字。
 * 「CLT-2600123」と打っても「2600123」と打っても同じ番号として扱う。
 * 検索欄と保存前の両方でこれを通す。
 */
export function normalizeNumber(value: string): string {
  return value
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(new RegExp(`^\\s*(?:${CUSTOMER_NUMBER_PREFIX}|${SESSION_NUMBER_PREFIX})`, "i"), "")
    .replace(/[\s\-‐－ー_./]/g, "");
}
