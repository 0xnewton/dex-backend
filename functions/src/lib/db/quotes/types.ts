import { QuoteResponse } from "@jup-ag/api";
import { Timestamp } from "firebase-admin/firestore";
import { ReferralID } from "../referrals";
import { UserID } from "../users";

export type QuoteID = string;

export interface QuoteWithoutReferralDB {
  id: QuoteID;
  timestamp: Timestamp; // issuedAt
  expiresAt: Timestamp; // TTL
  userPublicKey: string | null;
  platformFeeBps: number;
  referralId: string | null;
  referralSlug: string | null;
  referralUserId: string | null;
  swapMode: "ExactIn";
  dynamicSlippage: boolean;
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;

  quote: QuoteResponse;
}

export interface QuoteWithReferralDB extends Omit<QuoteWithoutReferralDB, "referralId" | "referralSlug" | "referralUserId"> {
    referralId: ReferralID;
    referralSlug: string;
    referralUserId: UserID;
}

export type QuoteDB = QuoteWithoutReferralDB | QuoteWithReferralDB;
