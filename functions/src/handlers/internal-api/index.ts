import referralRouter from "./referrals";
import swapRouter from "./swaps";
import { onRequest } from "firebase-functions/https";
import { express } from "express";

const internalApi = express();


