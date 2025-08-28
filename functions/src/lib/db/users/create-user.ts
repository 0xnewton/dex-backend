import { UserDB } from "./types";
import { getUserDoc } from "../generic";
import { SolanaWalletAddress } from "../generic/types";

interface CreateUserPayload {
  userID: string;
  slug: string;
  displayName: string;
  avatarUrl?: string;
  walletAddress: SolanaWalletAddress;
  privateKeyPath: string;
}

export const createUser = async (
  payload: CreateUserPayload
): Promise<UserDB> => {
  const userDoc = getUserDoc(payload.userID);
  const timestamp = FirebaseFirestore.Timestamp.now();
  const userData: UserDB = {
    id: userDoc.id,
    slug: payload.slug,
    displayName: payload.displayName,
    avatarUrl: payload.avatarUrl ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
    walletAddress: payload.walletAddress,
    privateKeyPath: payload.privateKeyPath,
    deletedAt: null,
  };
  await userDoc.create(userData);
  return userData;
};
