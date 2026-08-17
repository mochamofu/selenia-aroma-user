"use client";

import { useParams } from "next/navigation";
import { AromaForm } from "@/components/admin/AromaForm";

export default function EditAromaPage() {
  const params = useParams<{ id: string }>();
  return <AromaForm mode="edit" aromaId={params.id} />;
}
