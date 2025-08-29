import { defineString } from "firebase-functions/params";

export enum VariableKeys {
  INTERMEDIATE_FEE_VAULT_PUBLIC_KEY = "INTERMEDIATE_FEE_VAULT_PUBLIC_KEY",
  PLATFORM_TREASURY_PUBLIC_KEY = "PLATFORM_TREASURY_PUBLIC_KEY",
}

export const intermediateFeeVaultPublicKey = defineString(
  VariableKeys.INTERMEDIATE_FEE_VAULT_PUBLIC_KEY
);

export const platformTreasuryPublicKey = defineString(
  VariableKeys.PLATFORM_TREASURY_PUBLIC_KEY
);
