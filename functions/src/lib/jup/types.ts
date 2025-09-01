import { QuoteResponse, SwapInstructionsResponse } from "@jup-ag/api";
import {
  Connection,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { SolanaWalletAddress } from "../db/generic/types";

export interface ReferrerConfig {
  owner: SolanaWalletAddress;
  shareBpsOfFee: number;
}

export interface BuildSwapInstructionsArgs {
  connection: Connection;

  // From your already-validated quote (MUST be ExactIn)
  quoteResponse: QuoteResponse;
  inputMint: string; // base58
  inputAmountAtoms: string | number; // atoms from quote.inAmount (string ok)

  // Wallets
  userPublicKey: string; // payer (user), signs client-side
  intermediateFeeOwner: string; // your hot wallet (fee ATA authority)
  intermediateFeeOwnerSecretKey: Uint8Array; // server signer for fee ATA
  coldTreasuryOwner: SolanaWalletAddress; // receives remainder

  // Fees
  platformFeeBps: number; // e.g. 20 (0.20%)

  // Jupiter API
  dynamicSlippage?: boolean;
  dynamicComputeUnitLimit?: boolean;

  // Referrer
  referrer?: ReferrerConfig;
}

export interface AtaIx {
  ata: PublicKey;
  ix: TransactionInstruction | null;
}

export interface BuildSwapIntstructionsResult {
  txBase64: string;
  lastValidBlockHeight: number;
  swapIns: SwapInstructionsResponse;
}
