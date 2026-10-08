import "server-only";

/**
 * 決済のキーを読む。Cloudflare の Secrets（本番）か、手元の .dev.vars / 環境変数から。
 * キーが無ければ null。そのときオンライン決済は出さず、振込・来店時だけで動く。
 */
export async function readStripeKeys(): Promise<{ secretKey: string; webhookSecret: string } | null> {
  let env: Record<string, unknown> = {};
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    env = (await getCloudflareContext({ async: true })).env as Record<string, unknown>;
  } catch {
    env = {};
  }
  const read = (name: string) => {
    const value = env[name] ?? process.env[name];
    return typeof value === "string" ? value.trim() : "";
  };
  const secretKey = read("STRIPE_SECRET_KEY");
  return secretKey ? { secretKey, webhookSecret: read("STRIPE_WEBHOOK_SECRET") } : null;
}
