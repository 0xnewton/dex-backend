import { defineSecret } from "firebase-functions/params";

export enum SecretKeys {
  JUP_API_KEY = "JUP_API_KEY",
  INTERMEDIATE_FEE_VAULT_PRIVATE_KEY = "FEE_VAULT_PRIVATE_KEY",
  SOLANA_RPC_URL = "SOLANA_RPC_URL",
}

export const jupPrivateKey = defineSecret(SecretKeys.JUP_API_KEY);
export const intermediateFeeVaultPrivateKey = defineSecret(
  SecretKeys.INTERMEDIATE_FEE_VAULT_PRIVATE_KEY
);
export const solanaRpcUrl = defineSecret(SecretKeys.SOLANA_RPC_URL);
