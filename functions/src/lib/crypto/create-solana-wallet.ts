import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { WalletKeyPair } from "./types";

export const createSolanaWallet = (): WalletKeyPair => {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toString(),
    privateKey: bs58.encode(keypair.secretKey),
  };
};
