import { SolanaWalletAddress } from "../../lib/db/generic/types";
import { getReferralBySlug, ReferralDB } from "../../lib/db/referrals";
import { getJupiterClient } from "../../lib/jup/client";
import { createQuote, QuoteDB } from "../../lib/db/quotes";
import { NotFoundError } from "../../lib/errors";
import { DEFAULT_TOTAL_FEE_BPS } from "../../lib/constants";

const DEFAULT_SWAP_MODE = "ExactIn"; // Only ExactIn supported for now due to fee math

interface GetAndStoreQuotePayload {
  referralSlug?: string;
  userPublicKey: SolanaWalletAddress;
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps: number;
  dynamicSlippage: boolean;
}

interface GetAndStoreQuoteResponse {
  quote: QuoteDB;
}

export type GetAndStoreQuoteFunction = (
  payload: GetAndStoreQuotePayload
) => Promise<GetAndStoreQuoteResponse>;

export const getAndStoreQuote: GetAndStoreQuoteFunction = async (
  payload: GetAndStoreQuotePayload
) => {
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
  const quote = await client.quoteGet({
    inputMint: payload.inputMint,
    outputMint: payload.outputMint,
    amount: payload.amount,
    slippageBps: payload.slippageBps,
    platformFeeBps,
    swapMode: DEFAULT_SWAP_MODE,
    dynamicSlippage: payload.dynamicSlippage,
  });

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
