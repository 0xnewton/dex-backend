import { type Request as ExpressRequest } from "express";

// ---- Typed JSON-RPC helpers (no `any`) ----
const HEAVY_METHOD_RE = /^(sendTransaction|requestAirdrop)$/i;

/** Safely extract method names from a JSON-RPC body (single or batch). */
const extractRpcMethods = (body: unknown): string[] => {
  const methods: string[] = [];

  // If body came through as a string (bad client), try to parse
  let data: unknown = body;
  if (typeof body === "string") {
    try {
      data = JSON.parse(body);
    } catch {
      /* ignore */
    }
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === "object") {
        const m = (item as Record<string, unknown>).method;
        if (typeof m === "string") methods.push(m);
      }
    }
  } else if (data && typeof data === "object") {
    const m = (data as Record<string, unknown>).method;
    if (typeof m === "string") methods.push(m);
  }

  return methods;
};

/** True if the request contains any "heavy" JSON-RPC method. */
export const isHeavy = (req: ExpressRequest): boolean => {
  const methods = extractRpcMethods(req.body);
  return methods.some((m) => HEAVY_METHOD_RE.test(m));
};
