import { logger } from "firebase-functions";
import { getReferralCollectionGroup } from "../generic";
import { ReferralDB } from "./types";

export const getReferralBySlug = async (
  slug: string
): Promise<ReferralDB | null> => {
  logger.info(`Fetching referral with slug: ${slug}`, {slug});
  const collectionGroup = getReferralCollectionGroup();
  const slugKey: keyof ReferralDB = "slug";
  const deletedAtKey: keyof ReferralDB = "deletedAt";
  const snapshot = await collectionGroup
    .where(slugKey, "==", slug)
    .where(deletedAtKey, "==", null)
    .get();
  if (snapshot.empty) {
    return null;
  }
  const referral = snapshot.docs[0].data() as ReferralDB;
  return referral;
};
