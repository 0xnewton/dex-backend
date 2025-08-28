import { QuoteResponse } from "@jup-ag/api";
import {
  Connection,
} from "@solana/web3.js";
import { SolanaWalletAddress } from "../db/generic/types";

export interface BuildAtomicArgs {
  connection: Connection;

  // From your already-validated quote (MUST be ExactIn)
  quoteResponse: QuoteResponse;
  inputMint: string;              // base58
  inputAmountAtoms: string | number; // atoms from quote.inAmount (string ok)

  // Wallets
  userPublicKey: string;          // payer (user), signs client-side
  intermediateFeeOwner: string;   // your hot wallet (fee ATA authority)
  intermediateFeeOwnerSecretKey: Uint8Array; // server signer for fee ATA
  referrerOwner: SolanaWalletAddress;          // receives ref share
  coldTreasuryOwner: SolanaWalletAddress;      // receives remainder

  // Fees
  platformFeeBps: number;         // e.g. 20 (0.20%)
  referrerShareBpsOfFee?: number; // default 50% of fee (i.e., 10 of 20)

  // Jupiter API
  dynamicSlippage?: boolean;
  dynamicComputeUnitLimit?: boolean;
};
