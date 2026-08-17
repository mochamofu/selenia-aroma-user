export type CustomerNumberParts = {
  storeCode: string;
  fiscalYear: string;
  serial: string;
};

const CUSTOMER_NUMBER_PATTERN = /^\d{8}$/;

export const STORE_CODES: Record<string, string> = {
  "01": "銀座店",
};

export function isValidCustomerNumber(value: string): boolean {
  return CUSTOMER_NUMBER_PATTERN.test(value);
}

export function buildCustomerNumber({ storeCode, year, serial }: { storeCode: string; year: number; serial: number }): string {
  if (!/^\d{2}$/.test(storeCode)) throw new Error("店舗番号は2桁の数字で指定してください");
  if (serial < 1 || serial > 9999) throw new Error("店舗内連番は1〜9999の範囲で指定してください");
  const fiscalYear = String(year % 100).padStart(2, "0");
  return `${storeCode}${fiscalYear}${String(serial).padStart(4, "0")}`;
}

export function parseCustomerNumber(value: string): CustomerNumberParts | null {
  if (!isValidCustomerNumber(value)) return null;
  return {
    storeCode: value.slice(0, 2),
    fiscalYear: value.slice(2, 4),
    serial: value.slice(4, 8),
  };
}

export function describeCustomerNumber(value: string): string | null {
  const parts = parseCustomerNumber(value);
  if (!parts) return null;
  const storeName = STORE_CODES[parts.storeCode] ?? `店舗${parts.storeCode}`;
  return `${storeName} / 20${parts.fiscalYear}年 / ${Number(parts.serial)}番目`;
}
