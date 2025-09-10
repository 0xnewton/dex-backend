import {
  getReferralBySlug,
  getReferralCountForUser,
  createReferral as createReferralInDB,
} from "../../lib/db/referrals";
import { ReferralDB } from "../../lib/db/referrals/types";
import { getUserByID } from "../../lib/db/users";
import { UserDB, UserID } from "../../lib/db/users/types";
import {
  AlreadyExistsError,
  NotFoundError,
  ValidationError,
} from "../../lib/backend-framework/errors";
import { makeSlug } from "../../lib/slugs";
import { PLATFORM_FEE_BPS, MAX_BPS } from "../../lib/config/constants";

export interface CreateReferralServiceRequest {
  userID: UserID;
  slug?: string;
  description?: string;
  isActive?: boolean;
  /** total fee bps of trade going to referrer */
  feeAmountBps: number;
}

export type CreateReferralFunction = (
  payload: CreateReferralServiceRequest
) => Promise<ReferralDB>;

export const createReferral: CreateReferralFunction = async (payload) => {
  if (payload.feeAmountBps > MAX_BPS || payload.feeAmountBps < 0) {
    throw new ValidationError("feeAmountBps must be between 0 and 10,000");
  }
  if (payload.feeAmountBps + PLATFORM_FEE_BPS > MAX_BPS) {
    throw new ValidationError(
      `max fee amount is ${MAX_BPS - PLATFORM_FEE_BPS} bps`
    );
  }

  const user = await getUserByID(payload.userID);
  if (!user) {
    throw new NotFoundError(`User with ID ${payload.userID} not found`);
  }
  let slug = payload.slug;
  if (!slug) {
    slug = await generateSlugFromUser(user);
  }
  // Ensure slug is globally unique
  const existingReferral = await getReferralBySlug(slug);
  if (existingReferral) {
    throw new AlreadyExistsError(
      `Referral with slug ${slug} already exists for user ${user.id}`
    );
  }

  const referral = await createReferralInDB({
    userID: user.id,
    slug,
    description: payload.description,
    isActive: payload.isActive ?? true,
    platformFeeBps: PLATFORM_FEE_BPS,
    referrerFeeBps: payload.feeAmountBps,
  });

  return referral;
};

const generateSlugFromUser = async (user: UserDB) => {
  const referralCount = await getReferralCountForUser(user.id);
  let baseSlug = makeSlug(user.displayName ?? user.id);
  if (referralCount > 0) {
    baseSlug = `${baseSlug}-${referralCount + 1}`;
  }
  return baseSlug;
};
