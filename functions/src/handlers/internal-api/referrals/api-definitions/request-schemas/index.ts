import { z } from "zod";

export const createReferralBodySchema = z.object({
  slug: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  feeAmountBps: z.number(),
});
