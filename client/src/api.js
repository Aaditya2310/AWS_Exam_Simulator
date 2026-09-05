const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

function getToken() {
  return localStorage.getItem("token");
}

function setSession(token, username) {
  localStorage.setItem("token", token);
  localStorage.setItem("username", username);
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // no body
  }

  if (res.status === 401 && auth) {
    clearSession();
  }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data;
}

export const api = {
  getToken,
  getUsername: () => localStorage.getItem("username"),
  clearSession,

  register: async (username, password) => {
    const data = await request("/auth/register", { method: "POST", body: { username, password }, auth: false });
    setSession(data.token, data.username);
    return data;
  },
  login: async (username, password) => {
    const data = await request("/auth/login", { method: "POST", body: { username, password }, auth: false });
    setSession(data.token, data.username);
    return data;
  },
  me: () => request("/auth/me"),

  getExams: () => request("/exams"),
  startExam: (examId, count) => request(`/exams/${examId}/start`, { method: "POST", body: { count } }),
  submitExam: (sessionId, answers) =>
    request(`/exams/session/${sessionId}/submit`, { method: "POST", body: { answers } }),

  getMyHistory: () => request("/history/me"),
  getLeaderboard: () => request("/history/leaderboard"),
};
