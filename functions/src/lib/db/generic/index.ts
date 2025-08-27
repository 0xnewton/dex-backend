import { db } from "../../firebase";
import { DBCollection } from "./types";

export const getUserCollection = () => db.collection(DBCollection.USERS);
export const getUserDoc = (userID: string) => getUserCollection().doc(userID);
export const getNewUserDoc = () => getUserCollection().doc();
