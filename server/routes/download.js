import express from "express";
import { registerVideoDownload, getUserDownloadsList } from "../controllers/download.js";

const routes = express.Router();

routes.post("/register", registerVideoDownload);
routes.get("/history/:userId", getUserDownloadsList);

export default routes;
