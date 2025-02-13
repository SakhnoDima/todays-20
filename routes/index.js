import express from "express";
import { initializeScrapping } from "../controllers/initializeScrappingController.js";

const router = express.Router();

router.post("/init", initializeScrapping);

export default router;
