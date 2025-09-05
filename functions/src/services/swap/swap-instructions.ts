import { logger } from "firebase-functions";
import { QuoteDB } from "../../lib/db/quotes";
import { NotFoundError } from "../../lib/backend-framework";
import { getUserByID, UserDB } from "../../lib/db/users";
import { ReferralDB } from "../../lib/db/referrals";
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
import { getAndStoreQuote } from "./get-and-store-quote";
import { buildUnsignedSwapTxBase64 } from "../../lib/jup/build-unsigned-swap-tx-b64";

export interface SwapInstructionsPayload {
  referralSlug?: string;
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps: number;
  dynamicSlippage: boolean;
  userPublicKey: SolanaWalletAddress;
}

export interface SwapInstructionsResponse {
  instructions: BuildSwapIntstructionsResult;
  referral: ReferralDB | null;
  referrerUser: UserDB | null;
  quote: QuoteDB;
  serializedInstructions: string;
}

export type SwapInstructionsFunction = (
  payload: SwapInstructionsPayload
) => Promise<SwapInstructionsResponse>;

export const swapInstructions = async (
  payload: SwapInstructionsPayload
): Promise<SwapInstructionsResponse> => {
  logger.info("swapInstructions called with payload:", payload);
  // Recompute the quote for safety
  const { referral, quote } = await getAndStoreQuote({
    referralSlug: payload.referralSlug,
    userPublicKey: payload.userPublicKey,
    inputMint: payload.inputMint,
    outputMint: payload.outputMint,
    amount: payload.amount,
    slippageBps: payload.slippageBps,
    dynamicSlippage: payload.dynamicSlippage,
  });

  if (!referral && payload.referralSlug) {
    logger.error("Referral not found for quote with referral", {
      quote,
      referralSlug: payload.referralSlug,
    });
    throw new NotFoundError("Referral not found");
  }

  let referrerUser: UserDB | null = null;
  if (referral) {
    referrerUser = await getUserByID(referral.userID);
    if (!referrerUser) {
      logger.error("Referrer user not found for quote with referral", {
        quote,
        referralSlug: payload.referralSlug,
      });
      throw new NotFoundError("Referrer user not found");
    }
  }

  const referralConfig: ReferrerConfig | undefined =
    referral && referrerUser
      ? {
          owner: referrerUser.walletAddress,
          shareBpsOfFee: referral.referrerShareBpsOfFee,
        }
      : undefined;

  const rpcURL = solanaRpcUrl.value();
  const connection = new Connection(rpcURL);
  const intermediateVaultPrivateKey = loadKeypair(
    intermediateFeeVaultPrivateKey.value()
  );

  const buildAtomicTxArgs: BuildSwapInstructionsArgs = {
    connection,
    inputAmountAtoms: quote.amount,
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

  const serializedInstructions = await buildUnsignedSwapTxBase64(
    instructions.swapIns,
    payload.userPublicKey,
    connection
  );

  return {
    instructions,
    referral,
    referrerUser,
    quote,
    serializedInstructions,
  };
};
