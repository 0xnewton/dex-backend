import { UserID } from "../users/types";

export type ReferralID = string;
export interface FeeSplitBps {
  referrer: number;
  treasury: number;
}

export interface ReferralDB {
  id: ReferralID;
  userID: UserID;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  feeBps: number;
  splitBps: FeeSplitBps;
  isActive: boolean;
  description: string | null;
  deletedAt: FirebaseFirestore.Timestamp | null;
}
