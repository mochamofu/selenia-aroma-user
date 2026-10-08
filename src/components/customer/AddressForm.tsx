"use client";

import type { ContactFields } from "@/lib/shop";

/**
 * お届け先の入力欄。再注文の画面とマイページの「お届け先」で使う。
 * はじめて入れる方には、使いみちを説明して同意をいただく。
 */

export const CONSENT_TEXT =
  "ご入力いただいた住所・電話番号・メールアドレスは、ご注文の香りのお届けと、ご注文についてのご連絡のためだけに使います。見られるのはサロンの施術者とご本人だけです。消してほしいときは、サロンにお申し出ください。";

type Errors = Partial<Record<keyof ContactFields, string>>;

const FIELDS: Array<{ key: keyof ContactFields; label: string; placeholder: string; type?: string; autoComplete: string; required?: boolean }> = [
  { key: "postalCode", label: "郵便番号", placeholder: "123-4567", autoComplete: "postal-code", required: true },
  { key: "address1", label: "住所", placeholder: "都道府県・市区町村・番地", autoComplete: "street-address", required: true },
  { key: "address2", label: "建物名・部屋番号", placeholder: "〇〇マンション 101", autoComplete: "address-line2" },
  { key: "phone", label: "電話番号", placeholder: "090-1234-5678", type: "tel", autoComplete: "tel", required: true },
  { key: "email", label: "メールアドレス", placeholder: "発送のお知らせに使います", type: "email", autoComplete: "email" },
  { key: "shipName", label: "お届け先のお名前", placeholder: "ご本人あてなら空のままで", autoComplete: "name" },
];

export function AddressForm({
  value,
  onChange,
  errors,
  needsConsent,
  consent,
  onConsentChange,
}: {
  value: ContactFields;
  onChange: (next: ContactFields) => void;
  errors: Errors;
  needsConsent: boolean;
  consent: boolean;
  onConsentChange: (next: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      {FIELDS.map((field) => (
        <label key={field.key} className="block">
          <span className="text-xs font-bold text-stone-500">
            {field.label}
            {field.required ? <span className="ml-1 text-[#9f7a2f]">必須</span> : null}
          </span>
          <input
            type={field.type ?? "text"}
            value={value[field.key]}
            autoComplete={field.autoComplete}
            onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
            placeholder={field.placeholder}
            className={`mt-1 h-12 w-full rounded-2xl border bg-white px-4 text-base outline-none focus:border-[#755aa8] ${
              errors[field.key] ? "border-red-400" : "border-stone-200"
            }`}
          />
          {errors[field.key] ? <span className="mt-1 block text-xs font-bold text-red-600">{errors[field.key]}</span> : null}
        </label>
      ))}
      {needsConsent ? (
        <div className="rounded-2xl bg-[#faf7f1] p-4">
          <p className="text-xs leading-6 text-stone-600">{CONSENT_TEXT}</p>
          <label className="mt-3 flex items-start gap-3 text-sm font-bold text-stone-800">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => onConsentChange(event.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#755aa8]"
            />
            上の内容に同意します
          </label>
        </div>
      ) : null}
    </div>
  );
}
