import { Router } from "express";
import { swapsController } from "./controller";

const api = Router();
api.use(swapsController.basePath, swapsController.register());

export default api
