/**
 * DBへの問い合わせ口。
 *
 * 本番のCloudflare D1と、検証用のSQLiteの両方を同じ形で扱えるようにする。
 * リポジトリ層(repositories.ts)はこの型だけを見るため、接続先が変わっても
 * 問い合わせのコードは書き換えなくてよい。
 */
export type QueryRunner = {
  all<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]>;
  first<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T | null>;
};

/** Cloudflare D1 のバインディングが持つ最小限の形。 */
type D1Like = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all<T>(): Promise<{ results?: T[] }>;
      first<T>(): Promise<T | null>;
    };
  };
};

export function createD1Runner(db: D1Like): QueryRunner {
  return {
    async all(sql, params) {
      const { results } = await db.prepare(sql).bind(...params).all();
      return (results ?? []) as never;
    },
    async first(sql, params) {
      return (await db.prepare(sql).bind(...params).first()) as never;
    },
  };
}
