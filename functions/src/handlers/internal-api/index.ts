import referralRouter from "./referrals";
import swapRouter from "./swaps";
import { onRequest } from "firebase-functions/https";
import express from "express";
import cors from "cors";
import { SecretKeys } from "../../lib/config/secrets";

const app = express();
app.use(cors());
app.use(express.json());

const swapApp = express();
swapApp.set("trust proxy", true); // Needed for rate limit
swapApp.use(swapRouter);

app.use(referralRouter);
app.use(swapApp);

export const internalApi = onRequest({
    secrets: [SecretKeys.SOLANA_RPC_URL, SecretKeys.JUP_API_KEY, SecretKeys.INTERMEDIATE_FEE_VAULT_PRIVATE_KEY],
  }, app);
