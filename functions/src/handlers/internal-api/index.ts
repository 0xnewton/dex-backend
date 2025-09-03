import referralRouter from "./referrals";
import swapRouter from "./swaps";
import { onRequest } from "firebase-functions/https";
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const swapApp = express();
swapApp.set("trust proxy", 1); // Needed for rate limit
swapApp.use(swapRouter);

app.use(referralRouter);
app.use(swapApp);

export const internalApi = onRequest(app);
