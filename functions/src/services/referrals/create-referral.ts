import { getReferralBySlug } from "../../lib/db/referrals";
import { getReferralCountForUser } from "../../lib/db/referrals";
import { ReferralDB } from "../../lib/db/referrals/types";
import { getUserByID } from "../../lib/db/users";
import { UserDB, UserID } from "../../lib/db/users/types";
import { AlreadyExistsError } from "../../lib/backend-framework/errors";
import { makeSlug } from "../../lib/slugs";
import { createReferral as createReferralInDB } from "../../lib/db/referrals";
import {
  DEFAULT_REFERRER_SHARE_BPS_OF_FEE,
  DEFAULT_TOTAL_FEE_BPS,
} from "../../lib/config/constants";

export interface CreateReferralServiceRequest {
  userID: UserID;
  slug?: string;
  description?: string;
  isActive?: boolean;
}

export type CreateReferralFunction = (
  payload: CreateReferralServiceRequest
) => Promise<ReferralDB>;

export const createReferral: CreateReferralFunction = async (payload) => {
  const user = await getUserByID(payload.userID);
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
    feeBps: DEFAULT_TOTAL_FEE_BPS,
    referrerShareBpsOfFee: DEFAULT_REFERRER_SHARE_BPS_OF_FEE,
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
