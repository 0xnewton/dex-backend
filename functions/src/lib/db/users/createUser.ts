import { UserDB } from "./types";
import { getNewUserDoc } from "../generic";
import { SOLANA_WALLET_ADDRESS } from "../generic/types";

interface CreateUserPayload {
  userID: string;
  displayName: string;
  avatarUrl?: string;
  walletAddress: SOLANA_WALLET_ADDRESS;
  privateKeyPath: string;
}

export const createUser = async (
  payload: CreateUserPayload
): Promise<UserDB> => {
  const userDoc = getNewUserDoc();
  const timestamp = FirebaseFirestore.Timestamp.now();
  const userData: UserDB = {
    id: payload.userID,
    displayName: payload.displayName,
    avatarUrl: payload.avatarUrl,
    createdAt: timestamp,
    updatedAt: timestamp,
    walletAddress: payload.walletAddress,
    privateKeyPath: payload.privateKeyPath,
  };
  await userDoc.create(userData);
  return userData;
};
