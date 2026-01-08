import { SwapApi, createJupiterApiClient } from "@jup-ag/api";
import { jupPrivateKey } from "../config/secrets";

let client: SwapApi | null = null;

export const getJupiterClient = () => {
  if (!client) {
    const apiKey = jupPrivateKey.value();
    client = createJupiterApiClient(apiKey ? { apiKey } : undefined);
  }
  return client;
};
