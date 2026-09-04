/**
 * D1へスキーマと初期データを流す。
 *
 *   npm run db:migrate         本番のD1へ流す（Cloudflare上のデータベース）
 *   npm run db:migrate:local   手元の仮想D1へ流す（動作確認用。課金も影響もなし）
 *   npm run db:tables          いま何のテーブルがあるかを見る
 *
 * cloudflare/d1/*.sql を番号順に流す。ダッシュボードのコンソールと違い、
 * 改行もコメントもそのまま通るので、分割する必要がない。
 *
 * 初回だけ `npx wrangler login` が必要。ブラウザが開いて許可を押すだけ。
 */

import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlDir = path.join(root, "cloudflare", "d1");
const config = path.join(root, "wrangler.toml");
const DATABASE = "selenia-aroma";

const remote = process.argv.includes("--remote");
const target = remote ? "--remote" : "--local";

// console/ は1行に潰したコピペ用の複製なので、ここでは流さない（二重投入になる）
const files = readdirSync(sqlDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error("cloudflare/d1 に .sql がありません");
  process.exit(1);
}

console.log(`対象: ${remote ? "本番のD1 (Cloudflare上)" : "手元の仮想D1"}`);
console.log(`流すファイル: ${files.join(", ")}\n`);

for (const file of files) {
  process.stdout.write(`${file} ... `);
  const result = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", DATABASE, target, "--yes", "--config", config, "--file", path.join(sqlDir, file)],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.log("失敗");
    console.error(result.stdout ?? "");
    console.error(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }
  console.log("OK");
}

console.log("\n完了しました。テーブルの確認:");
console.log(`  npm run db:tables${remote ? "" : ":local"}`);
