"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CustomerShell } from "@/components/customer/CustomerShell";
import { AddressForm } from "@/components/customer/AddressForm";
import { Icon } from "@/components/Icon";
import { LoadingState } from "@/components/States";
import { useAuth } from "@/hooks/useAuth";
import type { ContactFields } from "@/lib/shop";

/** マイページの「お届け先情報」。再注文のときにここの内容を使う。 */

type Contact = ContactFields & { consentObtainedAt: string | null };

const EMPTY: Contact = { shipName: "", postalCode: "", address1: "", address2: "", phone: "", email: "", consentObtainedAt: null };

export default function AddressPage() {
  const { session } = useAuth("customer");
  const [contact, setContact] = useState<Contact | null>(null);
  const [form, setForm] = useState<ContactFields>(EMPTY);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFields, string>>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

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
      });
    return () => {
      alive = false;
    };
  }, [session?.userId]);

  const needsConsent = !contact?.consentObtainedAt;

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/me/contact", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...form, consent }),
      });
      const body = (await response.json().catch(() => ({}))) as { contact?: Contact; error?: string; fields?: typeof errors };
      if (!response.ok || !body.contact) {
        setErrors(body.fields ?? {});
        setMessage(body.error ?? "保存できませんでした");
        return;
      }
      setErrors({});
      setContact(body.contact);
      setForm(body.contact);
      setMessage("保存しました");
    } catch {
      setMessage("通信できませんでした");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CustomerShell>
      <div className="space-y-5 px-5 py-6">
        <header className="flex items-center gap-3">
          <Link href="/profile" className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-md" aria-label="戻る">
            <Icon name="ArrowLeft" className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-bold text-stone-900">お届け先情報</h1>
        </header>
        {contact === null ? (
          <LoadingState />
        ) : (
          <section className="rounded-[28px] bg-white p-5 shadow-lg shadow-stone-300/20">
            <AddressForm
              value={form}
              onChange={setForm}
              errors={errors}
              needsConsent={needsConsent}
              consent={consent}
              onConsentChange={setConsent}
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || (needsConsent && !consent)}
              className="mt-5 h-14 w-full rounded-full bg-[#755aa8] text-base font-bold text-white disabled:opacity-50"
            >
              {saving ? "保存しています…" : "保存する"}
            </button>
            {message ? (
              <p role="status" className="mt-3 text-center text-sm font-bold text-stone-600">
                {message}
              </p>
            ) : null}
          </section>
        )}
      </div>
    </CustomerShell>
  );
}
