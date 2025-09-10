import { QuoteResponse } from "@jup-ag/api";
import { getNewQuoteDoc } from "../generic";
import { QuoteDB } from "./types";
import { Timestamp } from "firebase-admin/firestore";
import { ReferralID } from "../referrals";
import { logger } from "firebase-functions";

interface CreateQuotePayload {
  userPublicKey?: string;
  platformFeeBps: number;
  referrerFeeBps: number;
  totalFeeBps: number;
  referralId?: ReferralID;
  referralSlug?: string;
  referralUserId?: string;
  swapMode: "ExactIn";
  dynamicSlippage: boolean;

  // Params snapshot (strings to avoid bigint issues)
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
  quote: QuoteResponse;
}

export const createQuote = async (
  payload: CreateQuotePayload
): Promise<QuoteDB> => {
  logger.info("Creating quote in db with payload", payload);
  const doc = getNewQuoteDoc();
  const now = Timestamp.now();
  const data: QuoteDB = {
    id: doc.id,
    timestamp: now,
    expiresAt: Timestamp.fromMillis(now.toMillis() + 60_000), // Expires in 60 seconds
    quote: payload.quote,
    userPublicKey: payload.userPublicKey ?? null,
    platformFeeBps: payload.platformFeeBps,
    totalFeeBps: payload.totalFeeBps,
    referrerFeeBps: payload.referrerFeeBps,
    referralId: payload.referralId ?? null,
    referralSlug: payload.referralSlug ?? null,
    referralUserId: payload.referralUserId ?? null,
    swapMode: payload.swapMode,
    dynamicSlippage: payload.dynamicSlippage,
    inputMint: payload.inputMint,
    outputMint: payload.outputMint,
    amount: payload.amount,
    slippageBps: payload.slippageBps,
  };

  await doc.create(data);

  return data;
};
