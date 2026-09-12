import { Router } from "express";
import { randomUUID } from "node:crypto";
import { sessions, attempts } from "../db.js";
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

router.get("/", (req, res) => res.json(examMetadata()));

router.post("/:examId/start", async (req, res) => {
  const exam = EXAMS[req.params.examId];
  if (!exam) return res.status(404).json({ error: "Unknown exam." });

  let count = Number(req.body?.count);
  if (!Number.isFinite(count)) count = 20;
  count = Math.max(5, Math.min(count, exam.questions.length));

  const sampled = shuffle(exam.questions).slice(0, count);
  const questionIds = sampled.map((q) => q.id);
  const timeLimitSec = Math.round(count * exam.secPerQuestion);

  const sessionId = randomUUID();
  await sessions.insertOne({
    id: sessionId,
    user_id: req.userId,
    exam_id: exam.id,
    question_ids: questionIds,
    time_limit_sec: timeLimitSec,
    started_at: new Date(),
    used: false,
  });

  const questions = sampled.map((q) => {
    const pub = publicQuestion(q);
    return { ...pub, opts: shuffle(pub.opts) };
  });

  res.status(201).json({ sessionId, timeLimitSec, questions });
});

router.post("/session/:sessionId/submit", async (req, res) => {
  const session = await sessions.findOne({ id: req.params.sessionId, user_id: req.userId });
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.used) return res.status(409).json({ error: "This exam session was already submitted." });

  const exam = EXAMS[session.exam_id];
  const questions = session.question_ids.map((id) => exam.questions.find((q) => q.id === id));
  const answers = req.body?.answers || {};
  const results = computeResults(exam, questions, answers);

  const elapsedSec = Math.max(0, Math.round((Date.now() - session.started_at.getTime()) / 1000));
  const timeTakenSec = Math.min(elapsedSec, session.time_limit_sec + 30);

  const attemptId = randomUUID();
  await attempts.insertOne({
    id: attemptId,
    user_id: req.userId,
    exam_id: exam.id,
    exam_code: exam.code,
    exam_name: exam.name,
    score: results.scaled,
    passed: results.passed,
    correct_count: results.correctCount,
    total: results.total,
    domain_stats: results.domainStats,
    time_taken_sec: timeTakenSec,
    created_at: new Date(),
  });

  await sessions.updateOne(
    { id: session.id, user_id: req.userId, used: false },
    { $set: { used: true } }
  );

  res.json({
    attemptId,
    exam: { code: exam.code, name: exam.name, passScore: exam.passScore, domains: exam.domains },
    ...results,
    timeTakenSec,
  });
});

export default router;
