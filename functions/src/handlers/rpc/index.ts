import express from "express";
import { onRequest } from "firebase-functions/v2/https";
import SolanaRpcService from "../../services/solana-rpc";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { rpcLimiter } from "./rate-limiter";

const app = express();
app.set("trust proxy", 1);

/** CORS for all /rpc routes */
app.use("/rpc", (req, res, next): void => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

/** Parse JSON before the limiter so req.body.method is available */
app.use("/rpc", express.json({ limit: "512kb" }));

/** Rate limit after JSON/CORS */
app.use("/rpc", rpcLimiter);
/**
 * Solana RPC proxy
 */
app.post("/rpc/solana", async (req, res) => {
  const solanaRpcService = new SolanaRpcService();

  const raw =
    typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  if (!raw) return res.status(400).json({ error: "empty_body" });

  try {
    const upstream = await solanaRpcService.postUpstream({
      body: raw,
      timeoutMs: 10_000,
    });

    res.status(upstream.status);
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") ?? "application/json"
    );
    res.setHeader("Cache-Control", "no-store");

    const webBody = upstream.body as NodeWebReadableStream | null; // type: ReadableStream<Uint8Array> | null

    if (webBody) {
      // Convert WHATWG ReadableStream -> NodeJS.ReadableStream
      const nodeStream = Readable.fromWeb(webBody);
      nodeStream.pipe(res);
    } else {
      res.end(); // no body to forward
    }
  } catch (err: any) {
    res
      .status(502)
      .json({ error: "upstream_error", message: err?.message ?? String(err) });
  }

  return;
});

// Wrap the express app in Firebase onRequest
export const rpc = onRequest(
  {
    timeoutSeconds: 15,
    memory: "512MiB",
    cpu: 1,
    cors: false,
    secrets: ["SOLANA_RPC_URL"],
  },
  app
);
