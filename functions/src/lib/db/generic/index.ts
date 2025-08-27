import { CollectionGroup, CollectionReference } from "firebase-admin/firestore";
import { db } from "../../firebase";
import { DBCollection } from "./types";
import { UserDB } from "../users/types";
import { ReferralDB } from "../referrals/types";

export const getUserCollection = () =>
  db.collection(DBCollection.USERS) as CollectionReference<UserDB>;
export const getUserDoc = (userID: string) => getUserCollection().doc(userID);
export const getNewUserDoc = () => getUserCollection().doc();
export const getReferralCollection = (userID: string) =>
  getUserDoc(userID).collection(
    DBCollection.REFERRALS
  ) as CollectionReference<ReferralDB>;
export const getReferralDoc = (userID: string, referralID: string) =>
  getReferralCollection(userID).doc(referralID);
export const getNewReferralDoc = (userID: string) =>
  getReferralCollection(userID).doc();
export const getReferralCollectionGroup = (): CollectionGroup<ReferralDB> =>
  db.collectionGroup(DBCollection.REFERRALS) as CollectionGroup<ReferralDB>;
