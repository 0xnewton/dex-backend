import rateLimit from "express-rate-limit";

export const swapRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many requests, slow down." });
  },
});