import { Router } from "express";
import { attempts, users } from "../db.js";
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
    domainStats: row.domain_stats,
    timeTakenSec: row.time_taken_sec,
    date: row.created_at,
  };
}

router.get("/me", async (req, res) => {
  const rows = await attempts.find({ user_id: req.userId }).sort({ created_at: -1 }).limit(200).toArray();
  res.json(rows.map(rowToJson));
});

router.get("/leaderboard", async (req, res) => {
  const rows = await attempts.aggregate([
    { $sort: { created_at: -1 } },
    { $limit: 200 },
    {
      $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $project: {
        _id: 0,
        id: 1, exam_id: 1, exam_code: 1, exam_name: 1, score: 1,
        passed: 1, correct_count: 1, total: 1, domain_stats: 1,
        time_taken_sec: 1, created_at: 1,
        username: "$user.name",
      },
    },
  ]).toArray();

  res.json(rows.map((r) => ({ ...rowToJson(r), username: r.username })));
});

export default router;
