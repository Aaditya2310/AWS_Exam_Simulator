import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import rateLimit from "express-rate-limit";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Brute-force protection: 10 attempts per 15 minutes per IP on auth routes.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." },
});
router.use(authLimiter);

function issueToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

router.post("/register", async (req, res) => {
  const { username, password } = req.body || {};

  if (typeof username !== "string" || username.trim().length < 3 || username.length > 32) {
    return res.status(400).json({ error: "Username must be 3-32 characters." });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const cleanUsername = username.trim();
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(cleanUsername);
  if (existing) {
    return res.status(409).json({ error: "That username is already taken." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const id = randomUUID();
  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)"
  ).run(id, cleanUsername, passwordHash, new Date().toISOString());

  const token = issueToken({ id, username: cleanUsername });
  res.status(201).json({ token, username: cleanUsername });
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Invalid credentials." });
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username.trim());
  // Generic error message regardless of which part was wrong, to avoid
  // leaking which usernames exist.
  if (!user) return res.status(401).json({ error: "Invalid username or password." });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid username or password." });

  const token = issueToken(user);
  res.json({ token, username: user.username });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ username: req.username });
});

export default router;
