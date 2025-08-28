import { QuoteResponse } from "@jup-ag/api";
import { Timestamp } from "firebase-admin/firestore";
import { ReferralID } from "../referrals";

export type QuoteID = string;

export interface QuoteDB {
  id: QuoteID;
  timestamp: Timestamp; // issuedAt
  expiresAt: Timestamp; // TTL
  //   status: "active" | "built" | "expired";

  // Bind to user & policy
  userPublicKey: string;
  platformFeeBps: number;
  referralId: ReferralID | null;
  referralSlug: string | null;
  referralUserId: string | null;
  swapMode: "ExactIn";
  dynamicSlippage: boolean;

  // Params snapshot (strings to avoid bigint issues)
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;

  quote: QuoteResponse;
}
