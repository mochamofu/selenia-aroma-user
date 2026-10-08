"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CustomerShell } from "@/components/customer/CustomerShell";
import { AddressForm } from "@/components/customer/AddressForm";
import { AromaImage } from "@/components/AromaImage";
import { Icon } from "@/components/Icon";
import { ErrorState, LoadingState } from "@/components/States";
import { useAromaRecord } from "@/hooks/useAromaRecords";
import { useAuth } from "@/hooks/useAuth";
import { useShop } from "@/hooks/useShop";
import {
  DEFAULT_SHOP_SETTINGS,
  isShippable,
  PAYMENT_METHOD_LABELS,
  quoteOrder,
  yen,
  type ContactFields,
  type PaymentMethod,
} from "@/lib/shop";

/**
 * 再注文。容量・本数・お届け先・お支払い方法を選んで注文する。
 * 金額はサーバーで価格表から出し直す（ここで出すのは目安の表示）。
 * カード・PayPay などを選んだときは、Stripe のお支払いページへ移る。
 */

type Contact = ContactFields & { consentObtainedAt: string | null };

const EMPTY: Contact = { shipName: "", postalCode: "", address1: "", address2: "", phone: "", email: "", consentObtainedAt: null };

export default function ReorderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { session, profile } = useAuth("customer");
  const { record, loading, error } = useAromaRecord(params.id, session?.userId);
  const shop = useShop(session?.userId);

  const [contact, setContact] = useState<Contact | null>(null);
  const [form, setForm] = useState<ContactFields>(EMPTY);
  const [editingAddress, setEditingAddress] = useState(false);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFields, string>>>({});
  const [volumeMl, setVolumeMl] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!session?.userId) return;
    let alive = true;
    fetch("/api/me/contact", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => (response.ok ? ((await response.json()) as { contact: Contact }).contact : EMPTY))
      .catch(() => EMPTY)
      .then((loaded) => {
        if (!alive) return;
        setContact(loaded);
        setForm(loaded);
        setEditingAddress(!loaded.consentObtainedAt || !isShippable(loaded));
      });
    return () => {
      alive = false;
    };
  }, [session?.userId]);

  // 価格表と支払い方法が読めたら、最初の選択肢を選んでおく
  const selectedVolume = volumeMl ?? shop?.priceList[0]?.volumeMl ?? null;
  const selectedMethod = method ?? shop?.methods[0] ?? null;
  const quote = useMemo(() => {
    if (!shop || selectedVolume === null) return null;
    return quoteOrder(
      { ...DEFAULT_SHOP_SETTINGS, priceList: shop.priceList, shippingFee: shop.shippingFee, freeShippingOver: shop.freeShippingOver },
      selectedVolume,
      quantity,
    );
  }, [shop, selectedVolume, quantity]);

  const needsConsent = !contact?.consentObtainedAt;
  const addressReady = editingAddress
    ? isShippable(form) && (!needsConsent || consent)
    : Boolean(contact && isShippable(contact));

  async function submit() {
    if (!record || selectedVolume === null || !selectedMethod) return;
    setSubmitting(true);
    setMessage("");
    try {
      if (editingAddress) {
        const saved = await fetch("/api/me/contact", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ ...form, consent }),
        });
        const body = (await saved.json().catch(() => ({}))) as { contact?: Contact; error?: string; fields?: typeof errors };
        if (!saved.ok || !body.contact) {
          setErrors(body.fields ?? {});
          setMessage(body.error ?? "お届け先を保存できませんでした");
          return;
        }
        setErrors({});
        setContact(body.contact);
        setEditingAddress(false);
      }

      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          aromaRecordId: record.id,
          volumeMl: selectedVolume,
          quantity,
          paymentMethod: selectedMethod,
          customerNote: note,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { order?: { id: string }; checkoutUrl?: string; error?: string };
      if (!response.ok || !body.order) {
        setMessage(body.error ?? "ご注文を受け付けられませんでした。時間をおいてもう一度お試しください");
        return;
      }
      if (body.checkoutUrl) {
        window.location.href = body.checkoutUrl;
        return;
      }
      router.push(`/orders/${body.order.id}?new=1`);
    } catch {
      setMessage("通信できませんでした。電波のよいところでもう一度お試しください");
    } finally {
      setSubmitting(false);
    }
  }

  const ready = !loading && shop !== null && contact !== null;

  return (
    <CustomerShell>
      <div className="space-y-5 px-5 py-6">
        <header className="flex items-center gap-3">
          <button onClick={() => router.back()} className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-md" aria-label="戻る">
            <Icon name="ArrowLeft" className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold text-stone-900">再注文</h1>
        </header>

        {error ? (
          <ErrorState message={error} />
        ) : !ready ? (
          <LoadingState />
        ) : !record ? (
          <ErrorState message="記録が見つかりません" />
        ) : !shop.open ? (
          <section className="rounded-[28px] bg-white p-6 text-center shadow-lg shadow-stone-300/20">
            <AromaImage title={record.title} className="mx-auto h-24 w-24 rounded-[22px]" />
            <h2 className="mt-4 font-bold text-stone-900">{record.title}</h2>
            {record.reorder_url ? (
              <a
                href={record.reorder_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#755aa8] text-base font-bold text-white"
              >
                外部ショップで購入する
                <Icon name="ExternalLink" className="h-5 w-5" />
              </a>
            ) : (
              <p className="mt-6 rounded-full bg-stone-200 px-5 py-4 text-sm font-bold text-stone-500">再注文は現在準備中です</p>
            )}
          </section>
        ) : (
          <>
            <section className="flex items-center gap-4 rounded-[28px] bg-white p-4 shadow-lg shadow-stone-300/20">
              <AromaImage title={record.title} className="h-20 w-20 shrink-0 rounded-[20px]" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-stone-500">あなただけの香り</p>
                <h2 className="truncate text-lg font-bold text-stone-900">{record.title}</h2>
                <p className="truncate text-xs text-stone-500">{record.base_blend_name}</p>
              </div>
            </section>

            <section className="rounded-[28px] bg-white p-5 shadow-lg shadow-stone-300/20">
              <h2 className="text-base font-bold text-stone-900">容量</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {shop.priceList.map((item) => (
                  <button
                    key={item.volumeMl}
                    type="button"
                    onClick={() => setVolumeMl(item.volumeMl)}
                    aria-pressed={selectedVolume === item.volumeMl}
                    className={`rounded-2xl border-2 p-3 text-left transition ${
                      selectedVolume === item.volumeMl ? "border-[#755aa8] bg-[#efe8fb]" : "border-stone-200 bg-white"
                    }`}
                  >
                    <span className="block text-lg font-bold text-stone-900">{item.volumeMl}mL</span>
                    <span className="block text-sm font-bold text-[#9f7a2f]">{yen(item.price)}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-stone-900">本数</h2>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                    disabled={quantity <= 1}
                    aria-label="1本へらす"
                    className="grid h-11 w-11 place-items-center rounded-full border border-stone-200 text-xl font-bold disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-lg font-bold tabular-nums" aria-live="polite">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => Math.min(20, value + 1))}
                    disabled={quantity >= 20}
                    aria-label="1本ふやす"
                    className="grid h-11 w-11 place-items-center rounded-full border border-stone-200 text-xl font-bold disabled:opacity-40"
                  >
                    ＋
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] bg-white p-5 shadow-lg shadow-stone-300/20">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-stone-900">お届け先</h2>
                {!editingAddress ? (
                  <button type="button" onClick={() => setEditingAddress(true)} className="text-sm font-bold text-[#755aa8]">
                    変更する
                  </button>
                ) : null}
              </div>
              {editingAddress ? (
                <div className="mt-3">
                  <AddressForm
                    value={form}
                    onChange={setForm}
                    errors={errors}
                    needsConsent={needsConsent}
                    consent={consent}
                    onConsentChange={setConsent}
                  />
                </div>
              ) : contact ? (
                <p className="mt-2 text-sm leading-6 text-stone-700">
                  〒{contact.postalCode}
                  <br />
                  {contact.address1} {contact.address2}
                  <br />
                  {contact.shipName || profile?.name} 様　{contact.phone}
                </p>
              ) : null}
            </section>

            <section className="rounded-[28px] bg-white p-5 shadow-lg shadow-stone-300/20">
              <h2 className="text-base font-bold text-stone-900">お支払い方法</h2>
              <div className="mt-3 space-y-2">
                {shop.methods.map((item) => (
                  <label
                    key={item}
                    className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-sm font-bold transition ${
                      selectedMethod === item ? "border-[#755aa8] bg-[#efe8fb]" : "border-stone-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      checked={selectedMethod === item}
                      onChange={() => setMethod(item)}
                      className="h-5 w-5 accent-[#755aa8]"
                    />
                    {PAYMENT_METHOD_LABELS[item]}
                  </label>
                ))}
              </div>
              {selectedMethod === "online" ? (
                <p className="mt-2 text-xs leading-5 text-stone-500">次の画面で、カード・PayPay・Apple Pay などからお選びいただけます。</p>
              ) : selectedMethod === "bank" ? (
                <p className="mt-2 text-xs leading-5 text-stone-500">ご注文のあとに振込先をご案内します。ご入金を確かめてからお作りします。</p>
              ) : null}
            </section>

            <section className="rounded-[28px] bg-white p-5 shadow-lg shadow-stone-300/20">
              <label className="block">
                <span className="text-base font-bold text-stone-900">サロンへのひとこと（任意）</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={500}
                  placeholder="お届けの希望などがあればどうぞ"
                  className="mt-2 min-h-20 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base outline-none focus:border-[#755aa8]"
                />
              </label>
            </section>

            {quote ? (
              <section className="rounded-[28px] bg-[#faf7f1] p-5">
                <dl className="space-y-1 text-sm text-stone-600">
                  <div className="flex justify-between">
                    <dt>
                      商品（{selectedVolume}mL × {quantity}本）
                    </dt>
                    <dd className="tabular-nums">{yen(quote.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>送料</dt>
                    <dd className="tabular-nums">{quote.shippingFee === 0 ? "無料" : yen(quote.shippingFee)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-bold text-stone-900">
                    <dt>お支払い合計（税込）</dt>
                    <dd className="tabular-nums">{yen(quote.total)}</dd>
                  </div>
                </dl>
                {shop.freeShippingOver !== null && quote.shippingFee > 0 ? (
                  <p className="mt-2 text-xs text-stone-500">{yen(shop.freeShippingOver)}以上で送料無料です。</p>
                ) : null}
              </section>
            ) : null}

            {message ? (
              <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {message}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting || !quote || !selectedMethod || !addressReady}
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#755aa8] text-base font-bold text-white shadow-lg shadow-[#755aa8]/25 transition active:scale-95 disabled:opacity-50"
            >
              {submitting ? "お手続き中…" : selectedMethod === "online" ? "お支払いへ進む" : "この内容で注文する"}
              <Icon name="ArrowRight" className="h-5 w-5" />
            </button>
            {!addressReady ? (
              <p className="text-center text-xs text-stone-500">
                {editingAddress && needsConsent && isShippable(form)
                  ? "お届け先の扱いへの同意をお願いします"
                  : "郵便番号・住所・電話番号を入れてください"}
              </p>
            ) : null}
            <p className="text-center text-xs text-stone-500">
              <Link href="/orders" className="font-bold text-[#755aa8]">
                ご注文の履歴
              </Link>
            </p>
          </>
        )}
      </div>
    </CustomerShell>
  );
}
