import { logger } from "firebase-functions";
import { QuoteDB } from "../../lib/db/quotes";
import { BadRequestError, NotFoundError } from "../../lib/backend-framework";
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
import {
  Connection,
  SimulateTransactionConfig,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { SolanaWalletAddress } from "../../lib/db/generic";
import { getAndStoreQuote } from "./get-and-store-quote";
import { MAX_BPS } from "../../lib/config/constants";

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
}

async function simulateBase64(connection: Connection, txBase64: string) {
  const bytes = Buffer.from(txBase64, "base64");

  // Try v0 first — if it deserializes, it's v0.
  try {
    const vtx = VersionedTransaction.deserialize(bytes);
    const cfg: SimulateTransactionConfig = {
      sigVerify: false,
      replaceRecentBlockhash: true,
    };
    return await connection.simulateTransaction(vtx, cfg);
  } catch (e) {
    // If that failed, treat it as legacy
    const ltx = Transaction.from(bytes);
    // Legacy overload has no config object. You can pass includeAccounts as 3rd arg if you want.
    return await connection.simulateTransaction(
      ltx /* signers? */,
      undefined /* includeAccounts? */
    );
    // or: return await connection.simulateTransaction(ltx, undefined, true);
  }
}

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
          feeAmountBps: referral.referrerFeeBps,
        }
      : undefined;

  const rpcURL = solanaRpcUrl.value();
  const connection = new Connection(rpcURL);
  const intermediateVaultPrivateKey = loadKeypair(
    intermediateFeeVaultPrivateKey.value()
  );

  logger.info("Building swap transaction with fee split", {
    inputAmountAtoms: quote.amount,
    quoteResponse: quote.quote,
    inputMint: quote.inputMint,
    userPublicKey: payload.userPublicKey,
    platformFeeBps: quote.platformFeeBps,
    dynamicSlippage: quote.dynamicSlippage,
    dynamicComputeUnitLimit: true,
    intermediateFeeOwner: intermediateFeeVaultPublicKey.value(),
    coldTreasuryOwner: platformTreasuryPublicKey.value(),
    referrer: referralConfig,
  });

  const totalFeeAmountBps = quote.platformFeeBps + (referralConfig?.feeAmountBps ?? 0);

  if (totalFeeAmountBps > MAX_BPS) {
    logger.error("Total fee bps exceeds 10,000", {
      platformFeeBps: quote.platformFeeBps,
      referrerFeeBps: referralConfig?.feeAmountBps,
      totalFeeAmountBps,
    });
    throw new BadRequestError("Total fee bps exceeds 10,000");
  }

  const buildAtomicTxArgs: BuildSwapInstructionsArgs = {
    connection,
    inputAmountAtoms: quote.amount,
    quoteResponse: quote.quote,
    inputMint: quote.inputMint,
    userPublicKey: payload.userPublicKey,
    totalFeeBps: totalFeeAmountBps,
    dynamicSlippage: quote.dynamicSlippage,
    dynamicComputeUnitLimit: true,
    intermediateFeeOwner: intermediateFeeVaultPublicKey.value(),
    intermediateFeeOwnerSecretKey: intermediateVaultPrivateKey.secretKey,
    coldTreasuryOwner: platformTreasuryPublicKey.value(),
    referrer: referralConfig,
  };

  const instructions = await buildAtomicSwapTxWithFeeSplit(buildAtomicTxArgs);

  try {
    logger.info("Simulating unsigned swap transaction");
    const sim = await simulateBase64(connection, instructions.txBase64);
    logger.info("Simulation result:", sim);
    if (sim.value.err) {
      logger.error("Simulation of unsigned swap transaction failed", {
        error: sim.value.err,
        logs: sim.value.logs,
      });
      throw new Error(
        "Simulation of unsigned swap transaction failed: " +
          JSON.stringify(sim.value.err)
      );
    }
    logger.info("Simulation succeeded", {
      unitsConsumed: sim.value.unitsConsumed,
      logs: sim.value.logs,
    });
  } catch (err) {
    logger.error("Error during simulation of unsigned swap transaction", err);
  }

  return {
    instructions,
    referral,
    referrerUser,
    quote,
  };
};
