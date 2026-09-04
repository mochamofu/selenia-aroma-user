"use client";

import Link from "next/link";
import { CustomerShell } from "@/components/customer/CustomerShell";
import { BaseBlendCard } from "@/components/customer/BaseBlendCard";
import { MoodCard } from "@/components/customer/MoodCard";
import { EssentialOilCard } from "@/components/customer/EssentialOilCard";
import { Icon } from "@/components/Icon";
import { useBaseBlends, useEssentialOils } from "@/hooks/useCatalog";
import { demoMoods } from "@/data/mockData";
import { useAuth } from "@/hooks/useAuth";

export default function MoodsPage() {
  useAuth("customer");
  const { items: oils } = useEssentialOils();
  const { items: baseBlends } = useBaseBlends();
  return (
    <CustomerShell>
      <div className="space-y-5 px-5 py-6">
        <header>
          <h1 className="text-2xl font-bold text-stone-900">気分・目的から探す</h1>
          <p className="mt-1 text-sm text-stone-500">今のあなたにぴったりの香りを見つけましょう</p>
        </header>
        <div className="space-y-3">
          {demoMoods.map((mood) => <MoodCard key={mood.id} mood={mood} />)}
        </div>
        <section className="rounded-[28px] bg-white p-5 shadow-lg shadow-stone-300/20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-stone-900">アロマオイル図鑑</h2>
              <p className="mt-1 text-sm text-stone-500">よく使われる精油36種類を確認できます</p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#efe8fb] text-[#755aa8]">
              <Icon name="Sparkles" className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-4 grid gap-3">
            {oils.slice(0, 4).map((oil) => <EssentialOilCard key={oil.id} oil={oil} />)}
          </div>
        </section>
        <section className="rounded-[28px] bg-white p-5 shadow-lg shadow-stone-300/20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-stone-900">ベースブレンド</h2>
              <p className="mt-1 text-sm text-stone-500">12種類の土台から探す</p>
            </div>
            <Link href="/base-blends" className="text-sm font-bold text-[#755aa8]">すべて</Link>
          </div>
          <div className="mt-4 grid gap-3">
            {baseBlends.slice(0, 3).map((blend) => <BaseBlendCard key={blend.id} blend={blend} />)}
          </div>
        </section>
      </div>
    </CustomerShell>
  );
}
