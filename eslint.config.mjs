import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // OpenNext が Workers 向けに生成する成果物。自分で書いたコードではない
    ".open-next/**",
    // wrangler がローカル検証用に作る仮想D1のデータ
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
