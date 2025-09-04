import rateLimit from "express-rate-limit";
import { isHeavy } from "./utils";

export const rpcLimiter = rateLimit({
  windowMs: 15_000, // 15s window
  max: (req) => (isHeavy(req) ? 5 : 90), // ~6 rps reads, ~0.33 rps heavy
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${req.path}`,
  skip: (req) => req.method === "OPTIONS",
});
