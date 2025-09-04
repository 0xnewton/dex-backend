import { solanaRpcUrl } from "../../lib/config/secrets";

interface PostUpstreamRequest {
  body: string; // raw JSON-RPC body
  timeoutMs?: number; // default ~10s
  headers?: Record<string, string>; // e.g. { "x-api-key": HELIUS_KEY }
}

export const postUpstream = async ({
  body,
  timeoutMs = 10_000,
  headers = {},
}: PostUpstreamRequest) => {
  const url = solanaRpcUrl.value(); // your secret-managed URL
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  } finally {
    clearTimeout(tid);
  }
};
