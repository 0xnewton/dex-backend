export type UserID = string;

export interface UserDB {
  id: UserID;
  displayName?: string;
  avatarUrl?: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  walletAddress: string;
  privateKeyPath: string;
}
