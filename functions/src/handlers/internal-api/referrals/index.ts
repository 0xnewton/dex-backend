import { Router } from "express";
import { referralsController } from "./controller";

const api = Router();
api.use(referralsController.basePath, referralsController.register());

export default api;
