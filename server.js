import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import tasksRoutes from "./routes/index.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const corsOptions = {
  origin: "http://topwomen.local",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders: "Content-Type, Authorization",
};

app.use(cors(corsOptions));
app.use(express.json());

app.use("/scrapping", tasksRoutes);

app.listen(PORT, () => {
  console.log(`Server http://localhost:${PORT} started`);
});
