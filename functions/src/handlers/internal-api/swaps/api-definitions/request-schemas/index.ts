import { z } from "zod";

export const getQuoteBodySchema = z.object({
  referralSlug: z.string().optional(),
  userPublicKey: z.string().optional(),
  inputMint: z.string(),
  outputMint: z.string(),
  amount: z.number(),
  slippageBps: z.number(),
  dynamicSlippage: z.boolean(),
});

export const quoteInstructionsBodySchema = z.object({
  userPublicKey: z.string(),
  inputMint: z.string(),
  outputMint: z.string(),
  amount: z.number(),
  slippageBps: z.number(),
  dynamicSlippage: z.boolean(),
  referralSlug: z.string().optional(),
});
