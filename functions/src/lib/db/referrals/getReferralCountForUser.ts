import { getReferralCollection } from "../generic";
import { UserID } from "../users/types";

export const getReferralCountForUser = async (
  userID: UserID
): Promise<number> => {
  const snapshot = await getReferralCollection(userID).get();
  return snapshot.size;
};
