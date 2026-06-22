import express from "express";
import { login, updateprofile, toggleSubscribe, sendOtp, verifyOtp, getAllUsers } from "../controllers/auth.js";
const routes = express.Router();

routes.post("/login", login);
routes.post("/send-otp", sendOtp);
routes.post("/verify-otp", verifyOtp);
routes.patch("/update/:id", updateprofile);
routes.patch("/subscribe/:id", toggleSubscribe);
routes.get("/all", getAllUsers);
export default routes;
