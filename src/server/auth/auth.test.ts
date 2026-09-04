import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createSqliteRunner } from "../db/sqliteRunner.ts";
import { hashPassword, needsRehash, timingSafeEqual, verifyPassword } from "./password.ts";
import { createCredential, login, MAX_FAILED_ATTEMPTS } from "./login.ts";
import {
  buildClearCookie,
  buildSessionCookie,
  createSession,
  createSessionToken,
  destroySession,
  findSession,
  hashToken,
  readSessionToken,
  SESSION_COOKIE,
  toViewer,
} from "./session.ts";
import { buildAromaRecordScope, selectWithScope } from "../db/access.ts";

let raw: DatabaseSync;
let db: ReturnType<typeof createSqliteRunner>;

before(async () => {
  raw = new DatabaseSync(":memory:");
  const dir = new URL("../../../cloudflare/d1/", import.meta.url);
  for (const f of ["0001_initial.sql", "0002_seed.sql", "0003_audit_consent.sql", "0004_store_scope.sql", "0005_auth.sql"]) {
    raw.exec(readFileSync(new URL(f, dir), "utf8"));
  }
  raw.exec(`insert into stores (id,store_code,name) values ('store-osaka','002','大阪店')`);
  raw.exec(`
    insert into profiles (id,user_id,store_id,customer_number,name,role) values
      ('p-staff','user-staff','store-ginza',null,'測定担当','operator'),
      ('p-admin','user-admin',null,null,'管理者','admin')
  `);
  raw.exec(`
    insert into aroma_records (id,user_id,title,made_at,status) values
      ('r-sakura','user-sakura','さくらの記録','2026-05-08','published'),
      ('r-ren','user-ren','蓮の記録','2026-04-18','published')
  `);
  db = createSqliteRunner(raw);

  // 繰り返し回数を落として実行時間を抑える。仕組みの検証が目的で、強度は別問題
  await db.run(`insert into credentials (id,user_id,login_id,password_hash) values (?,?,?,?)`, [
    "c1", "user-sakura", "sakura@example.com", await hashPassword("correct-horse-battery", 1000),
  ]);
  await db.run(`insert into credentials (id,user_id,login_id,password_hash) values (?,?,?,?)`, [
    "c2", "user-staff", "staff@example.com", await hashPassword("staff-password-1", 1000),
  ]);
  await db.run(`insert into credentials (id,user_id,login_id,password_hash) values (?,?,?,?)`, [
    "c3", "user-admin", "admin@example.com", await hashPassword("admin-password-1", 1000),
  ]);
});

describe("パスワードの保存", () => {
  test("元のパスワードは保存されない", async () => {
    const stored = await hashPassword("my-secret-password", 1000);
    assert.equal(stored.includes("my-secret-password"), false);
  });

  test("同じパスワードでも毎回違う値になる（saltが効いている）", async () => {
    const a = await hashPassword("same-password-here", 1000);
    const b = await hashPassword("same-password-here", 1000);
    assert.notEqual(a, b);
  });

  test("正しいパスワードは通る", async () => {
    const stored = await hashPassword("my-secret-password", 1000);
    assert.equal(await verifyPassword("my-secret-password", stored), true);
  });

  test("違うパスワードは通らない", async () => {
    const stored = await hashPassword("my-secret-password", 1000);
    assert.equal(await verifyPassword("my-secret-passwore", stored), false);
    assert.equal(await verifyPassword("", stored), false);
    assert.equal(await verifyPassword("my-secret-password ", stored), false);
  });

  test("短すぎるパスワードは登録できない", async () => {
    await assert.rejects(() => hashPassword("short"));
  });

  test("壊れた保存値は通らない", async () => {
    for (const bad of ["", "plain-text", "pbkdf2$abc$x$y", "md5$1$a$b", "pbkdf2$1000$!!!$!!!"]) {
      assert.equal(await verifyPassword("anything", bad), false, bad);
    }
  });

  test("繰り返し回数が基準より少なければ保存し直す合図が出る", async () => {
    assert.equal(needsRehash(await hashPassword("password-1234", 1000)), true);
    assert.equal(needsRehash(await hashPassword("password-1234")), false);
  });

  test("比較は長さが違えば false、中身が同じなら true", () => {
    assert.equal(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])), false);
    assert.equal(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])), true);
    assert.equal(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])), false);
  });
});

describe("ログイン", () => {
  test("正しいIDとパスワードで通る", async () => {
    const r = await login(db, "sakura@example.com", "correct-horse-battery");
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.userId, "user-sakura");
  });

  test("大文字や前後の空白があっても同じIDとして扱う", async () => {
    const r = await login(db, "  SAKURA@example.com  ", "correct-horse-battery");
    assert.equal(r.ok, true);
  });

  test("パスワードが違えば通らない", async () => {
    const r = await login(db, "sakura@example.com", "wrong-password-xx");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "invalid");
  });

  test("存在しないIDでも、パスワード違いと同じ結果を返す", async () => {
    // 区別できると、どのIDが登録済みかを外から調べられてしまう
    const missing = await login(db, "nobody@example.com", "any-password-here");
    const wrong = await login(db, "sakura@example.com", "any-password-here");
    assert.deepEqual(missing, wrong);
  });

  test("連続して失敗するとロックされ、正しいパスワードでも通らなくなる", async () => {
    await db.run(`insert into profiles (id,user_id,name,role) values ('p-lock','user-lock','ロック検証','customer')`, []);
    await createCredential(db, { userId: "user-lock", loginId: "lock@example.com", password: "lock-password-1" });
    // 実行時間を抑えるため繰り返し回数を落としておく
    await db.run(`update credentials set password_hash = ? where user_id = 'user-lock'`, [
      await hashPassword("lock-password-1", 1000),
    ]);

    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await login(db, "lock@example.com", "bad-password-xxx");
    }
    const r = await login(db, "lock@example.com", "lock-password-1");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "locked");
  });

  test("ログインに成功すると失敗回数が0に戻る", async () => {
    await login(db, "sakura@example.com", "bad-password-xxx");
    await login(db, "sakura@example.com", "correct-horse-battery");
    const row = await db.first<{ failed_attempts: number }>(
      `select failed_attempts from credentials where user_id = 'user-sakura'`, [],
    );
    assert.equal(row?.failed_attempts, 0);
  });
});

describe("セッション", () => {
  test("tokenそのものはDBに保存されない", async () => {
    const { token } = await createSession(db, { userId: "user-sakura" });
    const hit = await db.first(`select id from sessions where token_hash = ?`, [token]);
    assert.equal(hit, null, "tokenそのままでは引けない");
    const byHash = await db.first(`select id from sessions where token_hash = ?`, [await hashToken(token)]);
    assert.ok(byHash, "ハッシュでのみ引ける");
  });

  test("発行したtokenでセッションが引ける", async () => {
    const { token } = await createSession(db, { userId: "user-sakura" });
    const s = await findSession(db, token);
    assert.equal(s?.user_id, "user-sakura");
  });

  test("でたらめなtokenでは引けない", async () => {
    assert.equal(await findSession(db, createSessionToken()), null);
    assert.equal(await findSession(db, ""), null);
    assert.equal(await findSession(db, "' or '1'='1"), null);
  });

  test("期限切れのセッションは引けない", async () => {
    const { token } = await createSession(db, { userId: "user-sakura" });
    await db.run(`update sessions set expires_at = datetime('now','-1 day') where token_hash = ?`, [
      await hashToken(token),
    ]);
    assert.equal(await findSession(db, token), null);
  });

  test("ログアウトするとそのtokenは使えなくなる", async () => {
    const { token } = await createSession(db, { userId: "user-sakura" });
    assert.ok(await findSession(db, token));
    await destroySession(db, token);
    assert.equal(await findSession(db, token), null);
  });

  test("役割はセッションではなくprofilesから読む", async () => {
    // 権限を落としたときに、発行済みのセッションが古い権限で生き残らないこと
    const { token } = await createSession(db, { userId: "user-admin" });
    assert.equal((await findSession(db, token))?.role, "admin");
    await db.run(`update profiles set role = 'customer' where user_id = 'user-admin'`, []);
    assert.equal((await findSession(db, token))?.role, "customer");
    await db.run(`update profiles set role = 'admin' where user_id = 'user-admin'`, []);
  });
});

describe("Cookieの扱い", () => {
  test("HttpOnly と SameSite が付く", () => {
    const c = buildSessionCookie("abc", true);
    assert.ok(c.includes("HttpOnly"), "画面のJavaScriptから読めないようにする");
    assert.ok(c.includes("SameSite=Lax"));
    assert.ok(c.includes("Secure"));
  });

  test("httpのときは Secure を付けない（ローカル確認用）", () => {
    assert.equal(buildSessionCookie("abc", false).includes("Secure"), false);
  });

  test("消すCookieは Max-Age=0", () => {
    assert.ok(buildClearCookie(true).includes("Max-Age=0"));
  });

  test("Cookieヘッダからtokenを取り出せる", () => {
    assert.equal(readSessionToken(`${SESSION_COOKIE}=xyz123`), "xyz123");
    assert.equal(readSessionToken(`other=1; ${SESSION_COOKIE}=xyz123; more=2`), "xyz123");
    assert.equal(readSessionToken("other=1"), "");
    assert.equal(readSessionToken(null), "");
  });
});

describe("セッションから Viewer を作る", () => {
  test("セッションが無ければ guest", () => {
    assert.deepEqual(toViewer(null), { role: "guest" });
  });

  test("顧客は customer になる", () => {
    const v = toViewer({ id: "s", user_id: "user-sakura", store_id: null, expires_at: "", last_seen_at: "", role: "customer" });
    assert.deepEqual(v, { role: "customer", userId: "user-sakura" });
  });

  test("施術者には店舗が入る", () => {
    const v = toViewer({ id: "s", user_id: "user-staff", store_id: "store-ginza", expires_at: "", last_seen_at: "", role: "operator" });
    assert.deepEqual(v, { role: "operator", userId: "user-staff", storeId: "store-ginza" });
  });

  test("店舗が決まっていない施術者は、どの店舗にも一致しない", () => {
    const v = toViewer({ id: "s", user_id: "user-staff", store_id: null, expires_at: "", last_seen_at: "", role: "operator" });
    assert.deepEqual(v, { role: "operator", userId: "user-staff", storeId: "" });
  });

  test("管理者は admin になる", () => {
    const v = toViewer({ id: "s", user_id: "user-admin", store_id: null, expires_at: "", last_seen_at: "", role: "admin" });
    assert.deepEqual(v, { role: "admin", userId: "user-admin" });
  });
});

describe("認証と権限がつながっていること", () => {
  function rows(c: { sql: string; params: unknown[] }) {
    return raw.prepare(c.sql).all(...(c.params as never[]));
  }

  test("さくらのセッションからは、さくらの記録しか引けない", async () => {
    const { token } = await createSession(db, { userId: "user-sakura" });
    const viewer = toViewer(await findSession(db, token));
    const result = rows(selectWithScope("aroma_records", "id,user_id", buildAromaRecordScope(viewer)));
    assert.deepEqual(result.map((r) => r.id), ["r-sakura"]);
  });

  test("蓮のセッションからは、さくらの記録は引けない", async () => {
    const { token } = await createSession(db, { userId: "user-ren" });
    const viewer = toViewer(await findSession(db, token));
    const result = rows(selectWithScope("aroma_records", "id", buildAromaRecordScope(viewer)));
    assert.equal(result.some((r) => r.id === "r-sakura"), false);
  });

  test("セッションが無ければ1件も引けない", () => {
    const viewer = toViewer(null);
    const result = rows(selectWithScope("aroma_records", "id", buildAromaRecordScope(viewer)));
    assert.equal(result.length, 0);
  });

  test("他人のuser_idを知っていても、自分のセッションでは他人の記録を引けない", async () => {
    // 画面から渡された値ではなくセッションから Viewer を作るので、
    // user-ren を知っていても、さくらのセッションでは蓮の記録に届かない
    const { token } = await createSession(db, { userId: "user-sakura" });
    const viewer = toViewer(await findSession(db, token));
    const result = rows(
      selectWithScope("aroma_records", "id", buildAromaRecordScope(viewer), {
        extraSql: "user_id = ?",
        extraParams: ["user-ren"],
      }),
    );
    assert.equal(result.length, 0);
  });
});
