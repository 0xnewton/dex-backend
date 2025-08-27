export type UserID = string;

export interface UserDB {
  id: UserID;
  slug: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  walletAddress: string;
  privateKeyPath: string;
  deletedAt: FirebaseFirestore.Timestamp | null;
}
