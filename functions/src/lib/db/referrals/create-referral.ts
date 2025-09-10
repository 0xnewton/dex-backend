import { UserID } from "../users/types";
import { assertIntBps, getNewReferralDoc } from "../generic";
import { ReferralDB } from "./types";
import { Timestamp } from "firebase-admin/firestore";
import { ValidationError } from "../../backend-framework/errors";
import { logger } from "firebase-functions";

export interface CreateReferralPayload {
  userID: UserID;
  slug: string;
  description?: string;
  isActive: boolean;
  platformFeeBps: number;
  referrerFeeBps: number;
}

export const createReferral = async (
  payload: CreateReferralPayload
): Promise<ReferralDB> => {
  logger.info(`Creating referral for user ${payload.userID}`, {
    userID: payload.userID,
    payload,
  });
  // Validate bps (integers)
  assertIntBps(payload.platformFeeBps, "platformFeeBps", 0, 10_000);
  assertIntBps(
    payload.referrerFeeBps,
    "referrerFeeBps",
    0,
    10_000
  );
  assertIntBps(
    payload.platformFeeBps + payload.referrerFeeBps,
    "total fee bps",
    0,
    10_000
  );
  // If fee is zero, ref share must be zero (only matters if you later allow 0)
  if (payload.platformFeeBps === 0 && payload.referrerFeeBps !== 0) {
    throw new ValidationError(
      "referrerFeeBps must be 0 when platformFeeBps is 0"
    );
  }

  const referralDoc = getNewReferralDoc(payload.userID);
  const timestamp = Timestamp.now();
  const referralData: ReferralDB = {
    id: referralDoc.id,
    userID: payload.userID,
    slug: payload.slug,
    createdAt: timestamp,
    updatedAt: timestamp,
    platformFeeBps: payload.platformFeeBps,
    referrerFeeBps: payload.referrerFeeBps,
    isActive: payload.isActive,
    description: payload.description ?? null,
    deletedAt: null,
  };
  await referralDoc.create(referralData);
  return referralData;
};
