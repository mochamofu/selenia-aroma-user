import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Next.js を Cloudflare Workers 上で動かすための設定。
 * D1 と R2 のバインディングは cloudflare/wrangler.toml 側で定義している。
 */
export default defineCloudflareConfig();
