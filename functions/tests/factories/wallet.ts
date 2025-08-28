import { faker } from "@faker-js/faker";
import { WalletKeyPair } from "../../src/lib/crypto/types";

export const makeWallet = (
  overrides?: Partial<WalletKeyPair>
): WalletKeyPair => {
  const wallet = {
    publicKey: faker.random.alphaNumeric(44),
    privateKey: faker.random.alphaNumeric(88),
  };

  return {
    ...wallet,
    ...overrides,
  };
};
