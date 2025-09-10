import { UserID } from "../users/types";

export type ReferralID = string;

export interface ReferralDB {
  id: ReferralID;
  userID: UserID;
  slug: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  /** Bps fee for platform of trade volume */
  platformFeeBps: number;
  /** Bps fee for referrer of trade volume */
  referrerFeeBps: number;
  isActive: boolean;
  description: string | null;
  deletedAt: FirebaseFirestore.Timestamp | null;
}
