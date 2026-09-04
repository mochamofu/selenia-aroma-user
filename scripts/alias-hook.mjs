// node が "@/..." のパスエイリアスを解決できるようにするフック。
// tsconfig の paths と同じ対応（@/* -> src/*）をnode側にも与える。
const SRC = new URL("../src/", import.meta.url);

export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    let rest = specifier.slice(2);
    if (!/\.[a-z]+$/.test(rest)) rest += ".ts";
    return next(new URL(rest, SRC).href, context);
  }
  return next(specifier, context);
}
