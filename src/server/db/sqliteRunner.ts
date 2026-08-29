import type { DatabaseSync } from "node:sqlite";
import type { QueryRunner } from "./runner.ts";

/**
 * 検証用のSQLite接続。D1と同じ形で扱えるようにするための薄い層で、
 * 本番では使わない（本番は runner.ts の createD1Runner）。
 */
export function createSqliteRunner(db: DatabaseSync): QueryRunner {
  return {
    async all(sql, params) {
      return db.prepare(sql).all(...(params as never[])) as never;
    },
    async first(sql, params) {
      return (db.prepare(sql).get(...(params as never[])) ?? null) as never;
    },
  };
}
