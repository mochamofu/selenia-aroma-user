import { ReactNode } from "react";

export function FormSection({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[28px] bg-white p-5 shadow-lg shadow-stone-300/20 ${className}`}>
      <h2 className="mb-4 text-base font-bold text-stone-900">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
