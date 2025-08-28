import { UserID } from "../users/types";

export type ReferralID = string;

export interface ReferralDB {
  id: ReferralID;
  userID: UserID;
  slug: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  /** bps of trade (e.g., 30 = 0.3%) */
  feeBps: number;
  /** bps of fee (0..10_000) (e.g., 5000 for 50/50) */
  referrerShareBpsOfFee: number;
  isActive: boolean;
  description: string | null;
  deletedAt: FirebaseFirestore.Timestamp | null;
}
