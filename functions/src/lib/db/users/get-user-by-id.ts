import { logger } from "firebase-functions";
import { getUserDoc } from "../generic";
import { UserDB } from "./types";

export const getUserByID = async (userID: string): Promise<UserDB | null> => {
  logger.info(`Fetching user with ID: ${userID}`, { userID });
  const userDoc = await getUserDoc(userID).get();
  const data = userDoc.data();
  if (!userDoc.exists || !data) {
    return null;
  }
  return data;
};
