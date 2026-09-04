"use client";

import { CustomerShell } from "@/components/customer/CustomerShell";
import { BaseBlendCard } from "@/components/customer/BaseBlendCard";
import { useBaseBlends } from "@/hooks/useCatalog";
import { useAuth } from "@/hooks/useAuth";

export default function BaseBlendsPage() {
  useAuth("customer");
  const { items: baseBlends } = useBaseBlends();
  return (
    <CustomerShell>
      <div className="space-y-5 px-5 py-6">
        <header>
          <h1 className="text-2xl font-bold text-stone-900">ベースブレンド図鑑</h1>
          <p className="mt-1 text-sm leading-6 text-stone-500">セレニアアロマの12種類の土台です。配合比率は非公開です。</p>
        </header>
        <div className="space-y-3">
          {baseBlends.map((blend) => <BaseBlendCard key={blend.id} blend={blend} />)}
        </div>
      </div>
    </CustomerShell>
  );
}
