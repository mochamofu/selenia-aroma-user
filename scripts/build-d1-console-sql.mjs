import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// 文字列リテラルの中の -- を消さないように、1文字ずつ見てコメントを落とす。
function stripComments(sql) {
  let out = "", i = 0, inStr = false;
  while (i < sql.length) {
    const c = sql[i], n = sql[i + 1];
    if (inStr) {
      out += c;
      if (c === "'") inStr = sql[i + 1] === "'" ? (out += sql[++i], true) : false;
      i++;
      continue;
    }
    if (c === "'") { inStr = true; out += c; i++; continue; }
    if (c === "-" && n === "-") { while (i < sql.length && sql[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i++; i += 2; continue; }
    out += c; i++;
  }
  return out;
}

// 文の区切りの ; で分ける（文字列リテラル内の ; は無視）
function splitStatements(sql) {
  const stmts = []; let cur = "", inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (inStr) { cur += c; if (c === "'") { if (sql[i + 1] === "'") cur += sql[++i]; else inStr = false; } continue; }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === ";") { const t = cur.trim(); if (t) stmts.push(t); cur = ""; continue; }
    cur += c;
  }
  const t = cur.trim(); if (t) stmts.push(t);
  return stmts;
}

const dir = "cloudflare/d1/";
const out = dir + "console/";
mkdirSync(out, { recursive: true });

function build(srcFiles, label, maxChars) {
  const stmts = srcFiles.flatMap((f) =>
    splitStatements(stripComments(readFileSync(dir + f, "utf8")))
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter((s) => !/^pragma /i.test(s)),
  );
  const chunks = []; let cur = [];
  let len = 0;
  for (const s of stmts) {
    const add = s.length + 2;
    if (cur.length && len + add > maxChars) { chunks.push(cur); cur = []; len = 0; }
    cur.push(s); len += add;
  }
  if (cur.length) chunks.push(cur);
  chunks.forEach((c, i) => {
    const name = `${label}-${String(i + 1).padStart(2, "0")}of${String(chunks.length).padStart(2, "0")}.sql`;
    writeFileSync(out + name, c.join("; ") + ";\n");
    console.log(`${name}  ${c.join("; ").length} 文字 / ${c.length} 文`);
  });
  return chunks.length;
}

console.log("--- スキーマ ---");
build(["0001_initial.sql", "0003_audit_consent.sql", "0004_store_scope.sql"], "schema", 6000);
console.log("--- 初期データ ---");
build(["0002_seed.sql"], "seed", 6000);
