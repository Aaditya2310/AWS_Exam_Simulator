import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

function rowToJson(row) {
  return {
    id: row.id,
    examId: row.exam_id,
    examCode: row.exam_code,
    examName: row.exam_name,
    score: row.score,
    passed: !!row.passed,
    correctCount: row.correct_count,
    total: row.total,
    domainStats: JSON.parse(row.domain_stats),
    timeTakenSec: row.time_taken_sec,
    date: row.created_at,
  };
}

// Private: only the logged-in user's own attempts.
router.get("/me", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT 200")
    .all(req.userId);
  res.json(rows.map(rowToJson));
});

// Public-within-the-app: everyone's attempts, with usernames, no private data.
router.get("/leaderboard", (req, res) => {
  const rows = db
    .prepare(
      `SELECT attempts.*, users.username AS username
       FROM attempts JOIN users ON attempts.user_id = users.id
       ORDER BY attempts.created_at DESC LIMIT 200`
    )
    .all();
  res.json(rows.map((r) => ({ ...rowToJson(r), username: r.username })));
});

export default router;
