import referralRouter from "./referrals";
import swapRouter from "./swaps";
import { onRequest } from "firebase-functions/https";
import express from "express";

const api = express();

api.use(express.json());
api.use("/referrals", referralRouter);
api.use("/swaps", swapRouter);

export const internalApi = onRequest(api);
