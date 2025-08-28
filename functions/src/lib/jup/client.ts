import { SwapApi, createJupiterApiClient } from "@jup-ag/api";
// import { jupPrivateKey } from "../secrets";

let client: SwapApi | null = null;

export const getJupiterClient = () => {
  if (!client) {
    client = createJupiterApiClient();
  }
  return client;
};