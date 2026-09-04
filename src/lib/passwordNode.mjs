// scripts/seed-credentials.mjs から使う。src/server/auth/password.ts と
// 同じ形式(pbkdf2$回数$salt$hash)を作る。中身を変えるときは両方を揃えること。
const PBKDF2_ITERATIONS = 210_000;

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, key, 256,
  );
  const b64 = (a) => Buffer.from(a).toString("base64");
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}
