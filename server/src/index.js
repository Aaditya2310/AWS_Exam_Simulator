import "dotenv/config";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.js";
import examRoutes from "./routes/exams.js";
import historyRoutes from "./routes/history.js";

if (!process.env.JWT_SECRET) {
  console.error("Missing JWT_SECRET in environment. Refusing to start with an insecure default.");
  process.exit(1);
}

const app = express();
app.use(express.json());

const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
  })
);

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/history", historyRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found" }));

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`AWS exam server listening on :${port}`);
});
