"use client";

import { useMemo } from "react";
import { operatorCustomers } from "@/data/operatorCustomers";
import type { AromaRecord } from "@/types/aroma";

export function useAdminStats(records: AromaRecord[]) {
  return useMemo(
    () => ({
      customers: operatorCustomers.length,
      records: records.length,
      newThisMonth: records.filter((record) => record.made_at.startsWith("2026-05")).length,
    }),
    [records],
  );
}
