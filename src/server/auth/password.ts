/**
 * パスワードの保存と照合。
 *
 * 元のパスワードは保存しない。PBKDF2-SHA256 で伸長した結果だけを保存する。
 * bcrypt や argon2 は Cloudflare Workers で動かないため、標準のWebCrypto
 * だけで組んでいる。PBKDF2 は WebCrypto に入っており、追加の依存が要らない。
 *
 * 保存する形:
 *   pbkdf2$<繰り返し回数>$<salt(base64)>$<hash(base64)>
 *
 * 繰り返し回数を中に含めるのは、あとで回数を増やしたときに、古い記録も
 * そのまま照合できるようにするため。増やしたあとは、次回ログイン時に
 * 新しい回数で保存し直せばよい(needsRehash がそれを判定する)。
 */

/**
 * 繰り返し回数。
 *
 * OWASPの推奨は210,000回だが、Cloudflare Workers の無料プランは
 * 1リクエストあたりCPU 10ms が上限で、210,000回はおよそ99msかかるため
 * 途中で打ち切られる(ログインが500になる)。実測して収まる値にしている。
 *
 *   210,000回 … 約99ms  → 無料プランでは動かない
 *    10,000回 … 約5ms   → 収まる
 *
 * 回数は保存値に含めてあるため、あとから引き上げても古い記録はそのまま
 * 照合でき、次回ログイン時に新しい回数で保存し直される。
 * Workers Paid(月$5)にすればCPU上限を引き上げられるので、そのときは
 * この値を210,000へ戻すだけでよい。
 *
 * 回数が少ない分の弱さは、オフラインで総当たりされる場合に効いてくる。
 * オンラインからの総当たりは、10回失敗で15分ロックすることで抑えている。
 * 詳しくは docs/authentication.md の「繰り返し回数について」を参照。
 */
export const PBKDF2_ITERATIONS = 10_000;

const SALT_BYTES = 16;
const HASH_BITS = 256;

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(value: string): Uint8Array {
  const s = atob(value);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  if (password.length < 8) throw new Error("パスワードは8文字以上にしてください");
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);
  return `pbkdf2$${iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

/**
 * 照合。
 *
 * 比較は時間が一定になるように行う。先頭何文字が合っているかで応答時間が
 * 変わると、そこから1文字ずつ当てられてしまうため。
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1) return false;

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64(parts[2]);
    expected = fromBase64(parts[3]);
  } catch {
    return false;
  }

  const actual = await derive(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

/** 保存時の繰り返し回数が今の基準より少なければ、保存し直す合図を返す。 */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return true;
  const iterations = Number(parts[1]);
  return !Number.isInteger(iterations) || iterations < PBKDF2_ITERATIONS;
}

/**
 * 長さと中身が一致するかを、一定時間で比べる。
 * 途中で打ち切らないことが要点。
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
