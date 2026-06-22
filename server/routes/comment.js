import express from "express";
import { 
  deletecomment, 
  getallcomment, 
  postcomment, 
  editcomment,
  likecomment,
  dislikecomment
} from "../controllers/comment.js";

const routes = express.Router();
routes.get("/:videoid", getallcomment);
routes.post("/postcomment", postcomment);
routes.delete("/deletecomment/:id", deletecomment);
routes.post("/editcomment/:id", editcomment);
routes.post("/likecomment/:id", likecomment);
routes.post("/dislikecomment/:id", dislikecomment);
export default routes;
