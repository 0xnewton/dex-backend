import { SolanaWalletAddress } from "../../lib/db/generic/types";
import { getReferralBySlug, ReferralDB } from "../../lib/db/referrals";
import { getJupiterClient } from "../../lib/jup/client";
import { createQuote, QuoteDB } from "../../lib/db/quotes";
import { NotFoundError } from "../../lib/errors";
import { DEFAULT_TOTAL_FEE_BPS } from "../../lib/constants";
import { logger } from "firebase-functions";
import { QuoteGetRequest } from "@jup-ag/api";

const DEFAULT_SWAP_MODE = "ExactIn"; // Only ExactIn supported for now due to fee math

export interface GetAndStoreQuotePayload {
  referralSlug?: string;
  userPublicKey: SolanaWalletAddress;
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps: number;
  dynamicSlippage: boolean;
}

export interface GetAndStoreQuoteResponse {
  quote: QuoteDB;
}

export type GetAndStoreQuoteFunction = (
  payload: GetAndStoreQuotePayload
) => Promise<GetAndStoreQuoteResponse>;

export const getAndStoreQuote: GetAndStoreQuoteFunction = async (
  payload: GetAndStoreQuotePayload
) => {
  logger.info("getAndStoreQuote called with payload", payload);
  const client = getJupiterClient();

  let referral: ReferralDB | null = null;
  if (payload.referralSlug) {
    referral = await getReferralBySlug(payload.referralSlug);
    if (!referral) {
      throw new NotFoundError(
        `Referral with slug ${payload.referralSlug} not found`
      );
    }
  }

  const platformFeeBps = referral?.feeBps ?? DEFAULT_TOTAL_FEE_BPS;

  // Fetch quote from Jupiter
  const quoteBody: QuoteGetRequest = {
    inputMint: payload.inputMint,
    outputMint: payload.outputMint,
    amount: payload.amount,
    slippageBps: payload.slippageBps,
    platformFeeBps,
    swapMode: DEFAULT_SWAP_MODE,
    dynamicSlippage: payload.dynamicSlippage,
  }
  logger.info("Fetching quote from Jupiter with params:", quoteBody);
  const quote = await client.quoteGet(quoteBody);

  // Store quote in DB
  const quoteDB = await createQuote({
    userPublicKey: payload.userPublicKey,
    platformFeeBps,
    referralId: referral?.id,
    referralSlug: referral?.slug,
    referralUserId: referral?.userID,
    swapMode: DEFAULT_SWAP_MODE,
    dynamicSlippage: payload.dynamicSlippage,
    inputMint: payload.inputMint,
    outputMint: payload.outputMint,
    amount: String(payload.amount),
    slippageBps: payload.slippageBps,
    quote,
  });
  return { quote: quoteDB };
};
