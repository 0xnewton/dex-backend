import { NotFoundError } from "../../errors";
import { getUserDoc } from "../generic";
import { UserDB } from "./types";

export const getUserByID = async (userID: string): Promise<UserDB> => {
  const userDoc = await getUserDoc(userID).get();
  const data = userDoc.data();
  if (!userDoc.exists || !data) {
    throw new NotFoundError(`User with ID ${userID} not found`);
  }
  return data;
};
