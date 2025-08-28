import * as admin from "firebase-admin";
import { getFunctions } from "firebase-admin/functions";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const app = admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);
export * from "./get-project-id";
