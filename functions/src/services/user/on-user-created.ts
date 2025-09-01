import { UserRecord } from "firebase-admin/auth";
import { createUser } from "../../lib/db/users";
import { createSolanaWallet } from "../../lib/crypto";
import { logger } from "firebase-functions";
import { createSecret, deleteSecret } from "../../lib/secret-manager";
import { v4 as uuidv4 } from "uuid";
import { makeSlug } from "../../lib/slugs";

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
  const slug = user.displayName ? makeSlug(user.displayName) : user.uid;
  try {
    // Creates a user in firestore
    await createUser({
      userID: user.uid,
      slug,
      displayName: user.displayName || "",
      avatarUrl: user.photoURL || "",
      walletAddress: wallet.publicKey,
      privateKeyPath,
      providerDetails: user.providerData.map((provider) => ({
        providerName: provider.providerId,
        providerUserID: provider.uid,
        photoURL: provider.photoURL || null,
        displayName: provider.displayName || null,
      })),
    });
    logger.info("Successfully created user in Firestore", { uid: user.uid });
  } catch (error) {
    logger.error("Error creating user in Firestore", {
      details: error?.message,
      uid: user.uid,
    });
    // Clean up the secret if user creation fails
    await deleteSecret(secretId);
    throw error;
  }
};
