import { onUserCreated } from "../../src/services/user/on-user-created";
import { UserRecord } from "firebase-admin/auth";

// --- Mocks ---
jest.mock("../../src/lib/db/users", () => ({
  createUser: jest.fn(),
}));

jest.mock("../../src/lib/crypto", () => ({
  createSolanaWallet: jest.fn(),
}));

jest.mock("../../src/lib/secret-manager", () => ({
  createSecret: jest.fn(),
  deleteSecret: jest.fn(),
}));

jest.mock("uuid", () => ({
  v4: jest.fn(),
}));

jest.mock("../../src/lib/slugs", () => ({
  makeSlug: jest.fn(),
}));

import { createUser } from "../../src/lib/db/users";
import { createSolanaWallet } from "../../src/lib/crypto";
import { logger } from "firebase-functions";
import { createSecret, deleteSecret } from "../../src/lib/secret-manager";
import { v4 as uuidv4 } from "uuid";
import { makeSlug } from "../../src/lib/slugs";
import { faker } from "@faker-js/faker";
import { WalletKeyPair } from "../../src/lib/crypto/types";
import { makeWallet } from "../factories/wallet";
import { makeUser } from "../factories/users";

describe("onUserCreated", () => {
  let wallet: WalletKeyPair;
  let secretId: string;
  let secretPath: string;
  let user: UserRecord;

  beforeEach(() => {
    jest.resetAllMocks();
    wallet = makeWallet();
    secretId = faker.random.word();
    secretPath = faker.random.alphaNumeric(10);
    (createSolanaWallet as jest.Mock).mockReturnValue(wallet);
    (uuidv4 as jest.Mock).mockReturnValue(secretId);
    (createSecret as jest.Mock).mockResolvedValue(secretPath);
    let displayName = faker.internet.userName();
    const userDB = makeUser({
      displayName,
    });
    // Make it an auth user record
    user = {
      uid: userDB.id,
      displayName: displayName,
      photoURL: userDB.avatarUrl ?? undefined,
      emailVerified: false,
      disabled: faker.datatype.boolean(),
      metadata: {
        creationTime: Date.now().toLocaleString(),
        lastSignInTime: Date.now().toLocaleString(),
        toJSON: jest.fn(),
      },
      providerData: [],
      toJSON: jest.fn(),
    } as UserRecord;
  });

  it("creates wallet, stores secret, slugs from displayName, and creates user (happy path)", async () => {
    const expectedSlug = faker.helpers.slugify(user.displayName!);
    (makeSlug as jest.Mock).mockReturnValue(expectedSlug);
    (createUser as jest.Mock).mockResolvedValue(undefined);

    await onUserCreated(user);

    expect(logger.info).toHaveBeenCalled(); // at least once
    expect(createSolanaWallet).toHaveBeenCalledTimes(1);
    expect(uuidv4).toHaveBeenCalledTimes(1);
    expect(createSecret).toHaveBeenCalledWith(secretId, wallet.privateKey);
    expect(makeSlug).toHaveBeenCalledWith(user.displayName);

    expect(createUser).toHaveBeenCalledWith({
      userID: user.uid,
      slug: expectedSlug,
      displayName: user.displayName,
      avatarUrl: user.photoURL,
      walletAddress: wallet.publicKey,
      privateKeyPath: secretPath,
      providerDetails: [],
    });

    expect(deleteSecret).not.toHaveBeenCalled();
  });

  it("uses uid as slug when no displayName (and does not call makeSlug)", async () => {
    (user.displayName as any) = undefined;
    (user.photoURL as any) = undefined;
    (createUser as jest.Mock).mockResolvedValue(undefined);

    await onUserCreated(user);

    expect(makeSlug).not.toHaveBeenCalled();
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userID: user.uid,
        slug: user.uid, // fallback slug
        displayName: "", // empty when no displayName
        avatarUrl: "", // empty when no photoURL
        walletAddress: wallet.publicKey,
        privateKeyPath: secretPath,
      })
    );
  });

  it("deletes secret and rethrows when createUser fails", async () => {
    const expectedSlug = faker.helpers.slugify(faker.random.words());
    (makeSlug as jest.Mock).mockReturnValue(expectedSlug);

    const err = new Error("firestore create failed");
    (createUser as jest.Mock).mockRejectedValue(err);

    await expect(onUserCreated(user)).rejects.toBe(err);

    // Ensures cleanup happened with the same secret ID used for creation
    expect(deleteSecret).toHaveBeenCalledWith(secretId);

    expect(logger.error).toHaveBeenCalledWith(
      "Error creating user in Firestore",
      expect.objectContaining({ details: err.message, uid: user.uid })
    );
  });

  it("passes through the exact secret path returned by createSecret", async () => {
    const customSecretPath = "projects/p/ secrets/abc";
    (createSecret as jest.Mock).mockResolvedValue(customSecretPath);
    (makeSlug as jest.Mock).mockReturnValue("some-slug");
    (createUser as jest.Mock).mockResolvedValue(undefined);

    await onUserCreated(user);

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        privateKeyPath: customSecretPath,
      })
    );
  });

  it("passes provider details from auth user to createUser", async () => {
    const providerData = [
      {
        uid: "provider-user-id",
        displayName: "Provider User",
        email: "provider@example.com",
        photoURL: "http://example.com/photo.png",
        providerId: "google.com",
        phoneNumber: "+1234567890",
        toJSON: () => ({}),
      },
    ];
    user = {...user, providerData: providerData, toJSON: jest.fn()}; 
    (createUser as jest.Mock).mockResolvedValue(undefined);

    await onUserCreated(user);

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        providerDetails: providerData.map((provider) => ({
          providerName: provider.providerId,
          providerUserID: provider.uid,
          photoURL: provider.photoURL,
          displayName: provider.displayName,
        })),
      })
    );
  });
});
