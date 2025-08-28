import { UserID } from "../users/types";
import { assertIntBps, getNewReferralDoc } from "../generic";
import { ReferralDB } from "./types";
import { Timestamp } from "firebase-admin/firestore";
import { ValidationError } from "../../errors";
import { logger } from "firebase-functions";

export interface CreateReferralPayload {
  userID: UserID;
  slug: string;
  description?: string;
  isActive: boolean;
  feeBps: number;
  referrerShareBpsOfFee: number;
}

export const createReferral = async (
  payload: CreateReferralPayload
): Promise<ReferralDB> => {
  logger.info(`Creating referral for user ${payload.userID}`, {userID: payload.userID, payload});
  // Validate bps (integers)
  assertIntBps(payload.feeBps, 'feeBps', 0, 10_000);
  assertIntBps(payload.referrerShareBpsOfFee, 'referrerShareBpsOfFee', 0, 10_000);
  // If fee is zero, ref share must be zero (only matters if you later allow 0)
  if (payload.feeBps === 0 && payload.referrerShareBpsOfFee !== 0) {
    throw new ValidationError('referrerShareBpsOfFee must be 0 when feeBps is 0');
  }

  const referralDoc = getNewReferralDoc(payload.userID);
  const timestamp = Timestamp.now()
  const referralData: ReferralDB = {
    id: referralDoc.id,
    userID: payload.userID,
    slug: payload.slug,
    createdAt: timestamp,
    updatedAt: timestamp,
    feeBps: payload.feeBps,
    referrerShareBpsOfFee: payload.referrerShareBpsOfFee,
    isActive: payload.isActive,
    description: payload.description ?? null,
    deletedAt: null,
  };
  await referralDoc.create(referralData);
  return referralData;
};
