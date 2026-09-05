import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api.js";

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function App() {
  const [screen, setScreen] = useState("loading"); // loading | auth | home | exam | results | history
  const [username, setUsername] = useState(null);
  const [exams, setExams] = useState([]);
  const [session, setSession] = useState(null); // { sessionId, timeLimitSec, questions, examId }
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState({});
  const [current, setCurrent] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [results, setResults] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyTab, setHistoryTab] = useState("mine"); // mine | leaderboard
  const [historyLoading, setHistoryLoading] = useState(false);
  const [globalError, setGlobalError] = useState(null);
  const [showNav, setShowNav] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const timerRef = useRef(null);

  // Bootstrap: validate any existing token
  useEffect(() => {
    (async () => {
      const token = api.getToken();
      if (!token) {
        setScreen("auth");
        return;
      }
      try {
        const me = await api.me();
        setUsername(me.username);
        const list = await api.getExams();
        setExams(list);
        setScreen("home");
      } catch {
        api.clearSession();
        setScreen("auth");
      }
    })();
  }, []);

  // Countdown timer during an exam
  useEffect(() => {
    if (screen !== "exam") return;
    if (timeLeft <= 0) {
      handleSubmit();
      return;
    }
    timerRef.current = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, timeLeft]);

  const handleAuthed = async (username) => {
    setUsername(username);
    setGlobalError(null);
    try {
      const list = await api.getExams();
      setExams(list);
      setScreen("home");
    } catch (e) {
      setGlobalError(e.message);
    }
  };

  const handleLogout = () => {
    api.clearSession();
    setUsername(null);
    setScreen("auth");
  };

  const startExam = async (examId, count) => {
    setGlobalError(null);
    try {
      const data = await api.startExam(examId, count);
      setSession({ ...data, examId });
      setAnswers({});
      setFlagged({});
      setCurrent(0);
      setTimeLeft(data.timeLimitSec);
      setScreen("exam");
    } catch (e) {
      setGlobalError(e.message);
    }
  };

  const toggleAnswer = (qId, optId, multi) => {
    setAnswers((prev) => {
      const cur = prev[qId] || [];
      if (multi) {
        const next = cur.includes(optId) ? cur.filter((x) => x !== optId) : [...cur, optId];
        return { ...prev, [qId]: next };
      }
      return { ...prev, [qId]: [optId] };
    });
  };

  const toggleFlag = (qId) => setFlagged((prev) => ({ ...prev, [qId]: !prev[qId] }));

  const handleSubmit = useCallback(async () => {
    clearTimeout(timerRef.current);
    if (!session) return;
    try {
      const res = await api.submitExam(session.sessionId, answers);
      setResults(res);
      setScreen("results");
      setGlobalError(null);
    } catch (e) {
      setGlobalError(e.message);
      // Session may already be used (e.g. double-submit race) — send home rather than get stuck.
      setScreen("home");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, answers]);

  const loadHistory = async (tab) => {
    setHistoryLoading(true);
    setGlobalError(null);
    try {
      const data = tab === "leaderboard" ? await api.getLeaderboard() : await api.getMyHistory();
      setHistory(data);
    } catch (e) {
      setGlobalError(e.message);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const goHistory = (tab = historyTab) => {
    setHistoryTab(tab);
    setScreen("history");
    loadHistory(tab);
  };

  const answeredCount = session ? session.questions.filter((q) => (answers[q.id] || []).length > 0).length : 0;

  return (
    <div className="app-shell">
      {screen !== "loading" && screen !== "auth" && (
        <TopBar username={username} screen={screen} onHome={() => setScreen("home")} onHistory={() => goHistory()} onLogout={handleLogout} />
      )}

      <div className="content">
        {globalError && screen !== "auth" && (
          <div className="warn-banner">{globalError}</div>
        )}

        {screen === "loading" && <div className="center-text">Loading…</div>}

        {screen === "auth" && <AuthScreen onAuthed={handleAuthed} />}

        {screen === "home" && <HomeScreen exams={exams} onStart={startExam} />}

        {screen === "exam" && session && (
          <ExamScreen
            session={session}
            current={current}
            setCurrent={setCurrent}
            answers={answers}
            toggleAnswer={toggleAnswer}
            flagged={flagged}
            toggleFlag={toggleFlag}
            timeLeft={timeLeft}
            answeredCount={answeredCount}
            showNav={showNav}
            setShowNav={setShowNav}
            showSubmitConfirm={showSubmitConfirm}
            setShowSubmitConfirm={setShowSubmitConfirm}
            onSubmit={handleSubmit}
          />
        )}

        {screen === "results" && results && (
          <ResultsScreen
            results={results}
            onRetake={() => startExam(session.examId, session.questions.length)}
            onHome={() => setScreen("home")}
            onHistory={() => goHistory("mine")}
          />
        )}

        {screen === "history" && (
          <HistoryScreen
            history={history}
            loading={historyLoading}
            username={username}
            tab={historyTab}
            onTabChange={(t) => goHistory(t)}
          />
        )}
      </div>
    </div>
  );
}

/* ---------------- TOP BAR ---------------- */

function TopBar({ username, screen, onHome, onHistory, onLogout }) {
  return (
    <div className="top-bar">
      <div className="brand">
        <span className="brand-mark">AWS</span>
        <span className="brand-text">Exam Sim</span>
      </div>
      <div className="top-nav">
        <button className={`nav-btn ${screen === "home" ? "active" : ""}`} onClick={onHome}>Practice</button>
        <button className={`nav-btn ${screen === "history" ? "active" : ""}`} onClick={onHistory}>History</button>
        <div className="user-chip">
          {username}
          <button className="switch-btn" onClick={onLogout} title="Log out">⏻</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- AUTH ---------------- */

function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState("login"); // login | register
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!username.trim() || !password) {
      setError("Enter a username and password.");
      return;
    }
    if (mode === "register" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const data = mode === "register" ? await api.register(username.trim(), password) : await api.login(username.trim(), password);
      onAuthed(data.username);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="name-wrap">
      <div className="name-card">
        <div className="name-mark">AWS</div>
        <h1 className="name-title">Exam Simulator</h1>
        <div className="auth-toggle">
          <button className={`auth-tab ${mode === "login" ? "active" : ""}`} onClick={() => { setMode("login"); setError(null); }}>Log in</button>
          <button className={`auth-tab ${mode === "register" ? "active" : ""}`} onClick={() => { setMode("register"); setError(null); }}>Create account</button>
        </div>
        <input
          className="input"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <input
          className="input"
          type="password"
          placeholder={mode === "register" ? "Password (min 8 characters)" : "Password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {error && <div className="auth-error">{error}</div>}
        <button className="primary-btn" onClick={submit} disabled={loading}>
          {loading ? "Please wait…" : mode === "register" ? "Create account" : "Log in"}
        </button>
        <p className="name-sub" style={{ marginTop: 14, marginBottom: 0 }}>
          Passwords are hashed server-side (bcrypt) and never stored in plain text. History is private to your account by default; the leaderboard tab shows results across all users.
        </p>
      </div>
    </div>
  );
}

/* ---------------- HOME ---------------- */

function HomeScreen({ exams, onStart }) {
  const [pendingExam, setPendingExam] = useState(null);
  const [questionCount, setQuestionCount] = useState(20);

  if (exams.length === 0) {
    return <div className="center-text">Loading exams…</div>;
  }

  return (
    <div>
      <div className="home-header">
        <h1 className="h1">Choose a certification</h1>
        <p className="p-dim">Questions are shuffled from the pool each attempt — order and selection change every time.</p>
      </div>

      <div className="exam-grid">
        {exams.map((exam) => (
          <div key={exam.id} className="exam-card">
            <div className="exam-card-top" />
            <div className="exam-card-body">
              <div className="exam-code">{exam.code}</div>
              <div className="exam-name">{exam.name}</div>
              <div className="domain-bars">
                {Object.entries(exam.domains).map(([key, d]) => (
                  <div key={key} className="domain-row">
                    <div className="domain-label">{d.label}</div>
                    <div className="domain-bar-track">
                      <div className="domain-bar-fill" style={{ width: `${d.weight}%` }} />
                    </div>
                    <div className="domain-weight">{d.weight}%</div>
                  </div>
                ))}
              </div>
              <div className="exam-meta">{exam.poolSize} questions in pool · pass mark {exam.passScore}/1000</div>

              {pendingExam === exam.id ? (
                <div className="count-picker">
                  <div className="count-label">How many questions this attempt?</div>
                  <div className="count-options">
                    {[10, 20, Math.min(30, exam.poolSize)].map((n) => (
                      <button
                        key={n}
                        className={`count-btn ${questionCount === n ? "active" : ""}`}
                        onClick={() => setQuestionCount(n)}
                      >
                        {n === exam.poolSize ? `${n} (full pool)` : n}
                      </button>
                    ))}
                  </div>
                  <div className="time-estimate">~{Math.round((questionCount * exam.secPerQuestion) / 60)} min time limit</div>
                  <button className="primary-btn" onClick={() => onStart(exam.id, questionCount)}>Start exam</button>
                </div>
              ) : (
                <button className="secondary-btn" onClick={() => setPendingExam(exam.id)}>Practice this exam</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- EXAM ---------------- */

function ExamScreen({
  session, current, setCurrent, answers, toggleAnswer, flagged, toggleFlag,
  timeLeft, answeredCount, showNav, setShowNav, showSubmitConfirm, setShowSubmitConfirm, onSubmit,
}) {
  const questions = session.questions;
  const q = questions[current];
  const given = answers[q.id] || [];
  const urgent = timeLeft < session.timeLimitSec * 0.1;

  return (
    <div>
      <div className="exam-top-row">
        <div className="exam-progress">Question {current + 1} of {questions.length} · {answeredCount} answered</div>
        <div className={`timer-box ${urgent ? "urgent" : ""}`}>{fmtTime(timeLeft)}</div>
      </div>

      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${((current + 1) / questions.length) * 100}%` }} />
      </div>

      <div className="q-card">
        <div className="q-meta-row">
          <span className="q-domain-tag">{q.domain}</span>
          <button className="flag-btn" onClick={() => toggleFlag(q.id)}>
            {flagged[q.id] ? "★ Flagged" : "☆ Flag for review"}
          </button>
        </div>
        <div className="q-text">{q.q}</div>
        {q.multi && <div className="multi-hint">Choose two</div>}
        <div className="option-list">
          {q.opts.map((o) => {
            const selected = given.includes(o.id);
            return (
              <button
                key={o.id}
                className={`option-btn ${selected ? "selected" : ""}`}
                onClick={() => toggleAnswer(q.id, o.id, q.multi)}
              >
                <span className={`option-marker ${selected ? "selected" : ""}`}>{selected && "✓"}</span>
                {o.text}
              </button>
            );
          })}
        </div>
      </div>

      <div className="exam-footer">
        <button className="footer-btn" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}>
          ← Previous
        </button>
        <button className="footer-btn-ghost" onClick={() => setShowNav((s) => !s)}>
          Question {current + 1} / {questions.length}
        </button>
        {current < questions.length - 1 ? (
          <button className="footer-btn" onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}>
            Next →
          </button>
        ) : (
          <button className="submit-btn" onClick={() => setShowSubmitConfirm(true)}>Submit exam</button>
        )}
      </div>

      {showNav && (
        <div className="nav-grid">
          {questions.map((qq, i) => {
            const answeredQ = (answers[qq.id] || []).length > 0;
            const isCurrent = i === current;
            return (
              <button
                key={qq.id}
                className={`nav-cell ${isCurrent ? "current" : ""} ${answeredQ && !isCurrent ? "answered" : ""} ${flagged[qq.id] ? "flagged" : ""}`}
                onClick={() => { setCurrent(i); setShowNav(false); }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      )}

      {current === questions.length - 1 && (
        <button className="submit-btn full-width" onClick={() => setShowSubmitConfirm(true)}>Submit exam</button>
      )}

      {showSubmitConfirm && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-title">Submit this exam?</div>
            <div className="modal-body">
              {answeredCount} of {questions.length} questions answered.
              {answeredCount < questions.length && " Unanswered questions will be marked incorrect."}
            </div>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => setShowSubmitConfirm(false)}>Keep working</button>
              <button className="primary-btn" onClick={onSubmit}>Submit now</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- RESULTS ---------------- */

function ResultsScreen({ results, onRetake, onHome, onHistory }) {
  const [showReview, setShowReview] = useState(false);
  const pct = Math.round((results.correctCount / results.total) * 100);

  return (
    <div>
      <div className={`result-banner ${results.passed ? "pass" : "fail"}`}>
        <div>
          <div className="result-verdict">{results.passed ? "Pass" : "Not yet passing"}</div>
          <div className="result-sub">
            {results.exam.code} · {results.correctCount}/{results.total} correct · scaled score {results.scaled}/1000 (pass mark {results.exam.passScore})
          </div>
        </div>
        <div className="result-pct">{pct}%</div>
      </div>

      <div className="card">
        <div className="card-title">Score by domain</div>
        {Object.entries(results.domainStats).map(([key, stat]) => {
          const domainPct = stat.total ? Math.round((stat.correct / stat.total) * 100) : 0;
          const label = results.exam.domains[key]?.label || key;
          return (
            <div key={key} className="domain-result-row">
              <div className="domain-result-label">{label}</div>
              <div className="domain-bar-track">
                <div
                  className="domain-bar-fill"
                  style={{ width: `${domainPct}%`, background: domainPct >= 70 ? "var(--good)" : domainPct >= 50 ? "var(--accent)" : "var(--bad)" }}
                />
              </div>
              <div className="domain-result-count">{stat.correct}/{stat.total}</div>
            </div>
          );
        })}
      </div>

      <div className="actions-row">
        <button className="primary-btn" onClick={onRetake}>Retake ({results.total} new questions)</button>
        <button className="secondary-btn" onClick={onHome}>Back to exams</button>
        <button className="secondary-btn" onClick={onHistory}>View history</button>
      </div>

      <button className="review-toggle" onClick={() => setShowReview((s) => !s)}>
        {showReview ? "Hide" : "Review"} answers ({results.total})
      </button>

      {showReview && (
        <div className="review-list">
          {results.review.map((q, i) => (
            <div key={q.id} className="review-card">
              <div className="review-header">
                <span style={{ color: q.isCorrect ? "var(--good)" : "var(--bad)" }}>
                  {q.isCorrect ? "✓" : "✕"} Question {i + 1}
                </span>
                <span className="q-domain-tag">{q.domain}</span>
              </div>
              <div className="review-q">{q.q}</div>
              <div className="review-opts">
                {q.opts.map((o) => {
                  const wasGiven = q.given.includes(o.id);
                  const isRight = q.correct.includes(o.id);
                  return (
                    <div key={o.id} className={`review-opt ${isRight ? "correct" : ""} ${wasGiven && !isRight ? "wrong" : ""}`}>
                      {o.text}
                      {isRight && <span className="review-tag correct">correct</span>}
                      {wasGiven && !isRight && <span className="review-tag wrong">your answer</span>}
                    </div>
                  );
                })}
              </div>
              <div className="review-exp"><strong>Why:</strong> {q.exp}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- HISTORY ---------------- */

function HistoryScreen({ history, loading, username, tab, onTabChange }) {
  return (
    <div>
      <div className="home-header">
        <h1 className="h1">Result history</h1>
        <p className="p-dim">
          {tab === "mine" ? "Private to your account." : "Shared across everyone using this app."}
        </p>
      </div>

      <div className="history-controls">
        <div className="filter-group">
          <button className={`nav-btn ${tab === "mine" ? "active" : ""}`} onClick={() => onTabChange("mine")}>My history</button>
          <button className={`nav-btn ${tab === "leaderboard" ? "active" : ""}`} onClick={() => onTabChange("leaderboard")}>Leaderboard</button>
        </div>
      </div>

      {loading ? (
        <div className="center-text">Loading history…</div>
      ) : history.length === 0 ? (
        <div className="empty-state">No attempts recorded yet. Finish a practice exam to see it here.</div>
      ) : (
        <div className="history-table">
          <div className="history-row-head">
            {tab === "leaderboard" && <div className="h-col1">Name</div>}
            <div className="h-col2">Exam</div>
            <div className="h-col3">Score</div>
            <div className="h-col4">Result</div>
            <div className="h-col5">Date</div>
          </div>
          {history.map((h) => (
            <div key={h.id} className={`history-row ${h.username === username ? "mine" : ""}`}>
              {tab === "leaderboard" && <div className="h-col1">{h.username}</div>}
              <div className="h-col2">{h.examCode}</div>
              <div className="h-col3">{h.score}/1000 <span className="h-dim">({h.correctCount}/{h.total})</span></div>
              <div className="h-col4">
                <span style={{ color: h.passed ? "var(--good)" : "var(--bad)", fontWeight: 700 }}>{h.passed ? "PASS" : "FAIL"}</span>
              </div>
              <div className="h-col5">{new Date(h.date).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
