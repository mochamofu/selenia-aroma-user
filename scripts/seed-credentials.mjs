/**
 * ログイン用の資格情報を作る。
 *
 *   node scripts/seed-credentials.mjs --local    手元の仮想D1へ
 *   node scripts/seed-credentials.mjs --remote   本番のD1へ
 *
 * パスワードは PBKDF2 で伸長してから入れる。平文は保存しない。
 * 検証段階のアカウントなので、実データを扱う前に必ず作り直すこと。
 */
import { spawnSync } from "node:child_process";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const { hashPassword } = await import("../src/lib/passwordNode.mjs");

const remote = process.argv.includes("--remote");
const target = remote ? "--remote" : "--local";

// 検証用のアカウント。profiles に既に居る user_id と結びつける
const ACCOUNTS = [
  { userId: "user-sakura", loginId: "sakura@example.com", password: "selenia-demo-2026", label: "顧客(田中 さくら)" },
];

for (const a of ACCOUNTS) {
  const hash = await hashPassword(a.password);
  const sql = `insert or replace into credentials (id, user_id, login_id, password_hash) values ('cred-${a.userId}', '${a.userId}', '${a.loginId}', '${hash}')`;
  const r = spawnSync("npx", ["wrangler", "d1", "execute", "selenia-aroma", target, "--yes", "--command", sql], {
    encoding: "utf8",
  });
  console.log(`${a.label.padEnd(22)} ${a.loginId}  ->  ${r.status === 0 ? "OK" : "失敗"}`);
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    process.exit(1);
  }
}
console.log(`\n${remote ? "本番" : "手元"}のD1に登録しました。`);
