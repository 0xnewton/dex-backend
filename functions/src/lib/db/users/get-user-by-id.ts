import { logger } from "firebase-functions";
import { NotFoundError } from "../../errors";
import { getUserDoc } from "../generic";
import { UserDB } from "./types";

export const getUserByID = async (userID: string): Promise<UserDB> => {
  logger.info(`Fetching user with ID: ${userID}`, {userID});
  const userDoc = await getUserDoc(userID).get();
  const data = userDoc.data();
  if (!userDoc.exists || !data) {
    throw new NotFoundError(`User with ID ${userID} not found`);
  }
  return data;
};
