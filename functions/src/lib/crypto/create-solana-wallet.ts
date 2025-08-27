import { Keypair } from "@solana/web3.js";
import { WalletKeyPair } from "./types";

export const createSolanaWallet = (): WalletKeyPair => {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toString(),
    privateKey: keypair.secretKey.toString(),
  };
};
