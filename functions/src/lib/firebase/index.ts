import * as admin from "firebase-admin";
import { getFunctions } from "firebase-admin/functions";

const app = admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

export const db = admin.firestore(app);
export const auth = admin.auth(app);
export const functions = getFunctions(app);
export * from "./get-project-id";
