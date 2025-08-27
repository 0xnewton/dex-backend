import { UserRecord } from "firebase-admin/auth";
import { createUser } from "../../lib/db/users";
import { createSolanaWallet } from "../../lib/crypto";
import { logger } from "firebase-functions";
import { createSecret, deleteSecret } from "../../lib/secretManager";
import { v4 as uuidv4 } from "uuid";

export type OnUserCreatedFunction = (user: UserRecord) => Promise<void>;

export const onUserCreated: OnUserCreatedFunction = async (user) => {
  logger.info("User service - onUserCreated", { uid: user.uid, user });
  // Creates a wallet and stores the private key in KMS
  const wallet = createSolanaWallet();
  const secretId = uuidv4();
  logger.info("Created wallet for user", {
    address: wallet.publicKey,
    secretId,
  });
  const privateKeyPath = await createSecret(secretId, wallet.privateKey);

  try {
    // Creates a user in firestore
    await createUser({
      userID: user.uid,
      displayName: user.displayName || "",
      avatarUrl: user.photoURL || "",
      walletAddress: wallet.publicKey,
      privateKeyPath,
    });
  } catch (error) {
    logger.error("Error creating user in Firestore", { error, uid: user.uid });
    // Clean up the secret if user creation fails
    await deleteSecret(secretId);
    throw error;
  }
};
