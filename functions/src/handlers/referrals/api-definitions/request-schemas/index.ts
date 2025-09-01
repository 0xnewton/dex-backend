import { z } from "zod";

export const QueryParamsSchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
});

export const PathParamsSchema = z.object({
  referralId: z.string().uuid(),
});
