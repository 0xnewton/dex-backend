import { UserID } from "../users/types";
import { FeeSplitBps } from "./types";
import { getNewReferralDoc } from "../generic";
import { ReferralDB } from "./types";
import { Timestamp } from "firebase-admin/firestore";

export interface CreateReferralPayload {
  userID: UserID;
  slug: string;
  description?: string;
  isActive: boolean;
  feeBps: number;
  feeSplitBps: FeeSplitBps;
}

export const createReferral = async (
  payload: CreateReferralPayload
): Promise<ReferralDB> => {
  const referralDoc = getNewReferralDoc(payload.userID);
  const timestamp = Timestamp.now()
  const referralData: ReferralDB = {
    id: referralDoc.id,
    userID: payload.userID,
    slug: payload.slug,
    createdAt: timestamp,
    updatedAt: timestamp,
    feeBps: payload.feeBps,
    feeSplitBps: payload.feeSplitBps,
    isActive: payload.isActive,
    description: payload.description ?? null,
    deletedAt: null,
  };
  await referralDoc.create(referralData);
  return referralData;
};
