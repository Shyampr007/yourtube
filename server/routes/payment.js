import express from "express";
import { createPremiumOrder, verifyPremiumPayment } from "../controllers/payment.js";

const routes = express.Router();

routes.post("/order", createPremiumOrder);
routes.post("/verify", verifyPremiumPayment);

export default routes;
