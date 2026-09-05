import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { EXAMS, examMetadata, publicQuestion } from "../data/questions.js";
import { computeResults } from "../utils/grading.js";

const router = Router();
router.use(requireAuth);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

router.get("/", (req, res) => {
  res.json(examMetadata());
});

router.post("/:examId/start", (req, res) => {
  const exam = EXAMS[req.params.examId];
  if (!exam) return res.status(404).json({ error: "Unknown exam." });

  let count = Number(req.body?.count);
  if (!Number.isFinite(count)) count = 20;
  count = Math.max(5, Math.min(count, exam.questions.length));

  const sampled = shuffle(exam.questions).slice(0, count);
  const questionIds = sampled.map((q) => q.id);
  const timeLimitSec = Math.round(count * exam.secPerQuestion);

  const sessionId = randomUUID();
  db.prepare(
    `INSERT INTO sessions (id, user_id, exam_id, question_ids, time_limit_sec, started_at, used)
     VALUES (?, ?, ?, ?, ?, ?, 0)`
  ).run(sessionId, req.userId, exam.id, JSON.stringify(questionIds), timeLimitSec, new Date().toISOString());

  // Shuffle option display order per question; grading matches by option id
  // so this is safe and doesn't affect correctness checks.
  const questions = sampled.map((q) => {
    const pub = publicQuestion(q);
    return { ...pub, opts: shuffle(pub.opts) };
  });

  res.status(201).json({ sessionId, timeLimitSec, questions });
});

router.post("/session/:sessionId/submit", (req, res) => {
  const session = db
    .prepare("SELECT * FROM sessions WHERE id = ? AND user_id = ?")
    .get(req.params.sessionId, req.userId);

  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.used) return res.status(409).json({ error: "This exam session was already submitted." });

  const exam = EXAMS[session.exam_id];
  const questionIds = JSON.parse(session.question_ids);
  const questions = questionIds.map((id) => exam.questions.find((q) => q.id === id));
  const answers = req.body?.answers || {};

  const results = computeResults(exam, questions, answers);

  const startedAtMs = new Date(session.started_at).getTime();
  const elapsedSec = Math.max(0, Math.round((Date.now() - startedAtMs) / 1000));
  const timeTakenSec = Math.min(elapsedSec, session.time_limit_sec + 30); // small grace for network lag

  const attemptId = randomUUID();
  db.prepare(
    `INSERT INTO attempts
     (id, user_id, exam_id, exam_code, exam_name, score, passed, correct_count, total, domain_stats, time_taken_sec, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    attemptId,
    req.userId,
    exam.id,
    exam.code,
    exam.name,
    results.scaled,
    results.passed ? 1 : 0,
    results.correctCount,
    results.total,
    JSON.stringify(results.domainStats),
    timeTakenSec,
    new Date().toISOString()
  );

  db.prepare("UPDATE sessions SET used = 1 WHERE id = ?").run(session.id);

  res.json({ attemptId, exam: { code: exam.code, name: exam.name, passScore: exam.passScore, domains: exam.domains }, ...results, timeTakenSec });
});

export default router;
