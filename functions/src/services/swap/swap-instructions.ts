import { logger } from "firebase-functions";
import {
  getQuoteById,
  isQuoteWithReferral,
  QuoteDB,
  QuoteID,
} from "../../lib/db/quotes";
import {
  NotFoundError,
  ResourceExpiredError,
} from "../../lib/backend-framework";
import { getUserByID, UserDB } from "../../lib/db/users";
import { getReferralBySlug, ReferralDB } from "../../lib/db/referrals";
import {
  BuildSwapInstructionsArgs,
  buildAtomicSwapTxWithFeeSplit,
  ReferrerConfig,
  BuildSwapIntstructionsResult,
} from "../../lib/jup";
import {
  intermediateFeeVaultPrivateKey,
  solanaRpcUrl,
} from "../../lib/config/secrets";
import {
  intermediateFeeVaultPublicKey,
  platformTreasuryPublicKey,
} from "../../lib/config/variables";
import { loadKeypair } from "../../lib/crypto/load-keypair";
import { Connection } from "@solana/web3.js";
import { SolanaWalletAddress } from "../../lib/db/generic";

export interface SwapInstructionsPayload {
  quoteId: QuoteID;
  userPublicKey: SolanaWalletAddress;
}

export interface SwapInstructionsResponse {
  instructions: BuildSwapIntstructionsResult;
  referral: ReferralDB | null;
  referrerUser: UserDB | null;
  quote: QuoteDB;
}

export type SwapInstructionsFunction = (
  payload: SwapInstructionsPayload
) => Promise<SwapInstructionsResponse>;

export const swapInstructions: SwapInstructionsFunction = async (
  payload
): Promise<SwapInstructionsResponse> => {
  logger.info("swapInstructions called with payload:", payload);

  const quote = await getQuoteById(payload.quoteId);
  if (!quote) {
    throw new NotFoundError("Quote not found");
  }

  if (quote.expiresAt.toMillis() < Date.now()) {
    logger.info("Quote has expired", {
      quoteId: payload.quoteId,
      expiresAt: quote.expiresAt.toMillis(),
      currentTime: Date.now(),
    });
    throw new ResourceExpiredError("Quote has expired");
  }

  let referrerUser: UserDB | null = null;
  let referral: ReferralDB | null = null;
  let referralConfig: ReferrerConfig | undefined = undefined;
  if (isQuoteWithReferral(quote)) {
    [referrerUser, referral] = await Promise.all([
      getUserByID(quote.referralUserId),
      getReferralBySlug(quote.referralSlug),
    ]);
    if (!referral) {
      logger.error("Referral not found for quote with referral", {
        quoteId: payload.quoteId,
        referralSlug: quote.referralSlug,
      });
      throw new NotFoundError(`Referral not found`);
    }
    if (!referrerUser) {
      logger.error("Referrer user not found for quote with referral", {
        quoteId: payload.quoteId,
        referralSlug: quote.referralSlug,
      });
      throw new NotFoundError(`Referrer user not found`);
    }
    referralConfig = {
      owner: referrerUser.walletAddress,
      shareBpsOfFee: referral.referrerShareBpsOfFee,
    };
  }

  const rpcURL = solanaRpcUrl.value();
  const connection = new Connection(rpcURL);
  const intermediateVaultPrivateKey = loadKeypair(
    intermediateFeeVaultPrivateKey.value()
  );

  const buildAtomicTxArgs: BuildSwapInstructionsArgs = {
    connection,
    inputAmountAtoms: quote.quote.inAmount,
    quoteResponse: quote.quote,
    inputMint: quote.inputMint,
    userPublicKey: payload.userPublicKey,
    platformFeeBps: quote.platformFeeBps,
    dynamicSlippage: quote.dynamicSlippage,
    dynamicComputeUnitLimit: true,
    intermediateFeeOwner: intermediateFeeVaultPublicKey.value(),
    intermediateFeeOwnerSecretKey: intermediateVaultPrivateKey.secretKey,
    coldTreasuryOwner: platformTreasuryPublicKey.value(),
    referrer: referralConfig,
  };

  const instructions = await buildAtomicSwapTxWithFeeSplit(buildAtomicTxArgs);

  return {
    instructions,
    referral,
    referrerUser,
    quote,
  };
};
