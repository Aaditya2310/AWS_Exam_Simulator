const API_URL = import.meta.env.VITE_API_URL || "/api";

function getToken() {
  return localStorage.getItem("token");
}
function setSession(token, user) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}
function getUser() {
  try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
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
  try { data = await res.json(); } catch {}
  if (res.status === 401 && auth) clearSession();
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

export const api = {
  getToken,
  getUser,
  getUsername: () => getUser()?.name || "",
  clearSession,
  register: async (name, email, password) => {
    const data = await request("/auth/register", {
      method: "POST", body: { name, email, password }, auth: false
    });
    setSession(data.token, data.user);
    return data;
  },
  login: async (email, password) => {
    const data = await request("/auth/login", {
      method: "POST", body: { email, password }, auth: false
    });
    setSession(data.token, data.user);
    return data;
  },
  me: async () => {
    const user = await request("/auth/me");
    localStorage.setItem("user", JSON.stringify(user));
    return user;
  },
  getExams: () => request("/exams"),
  startExam: (examId, count) => request(`/exams/${examId}/start`, { method: "POST", body: { count } }),
  submitExam: (sessionId, answers) =>
    request(`/exams/session/${sessionId}/submit`, { method: "POST", body: { answers } }),
  getMyHistory: () => request("/history/me"),
  getLeaderboard: () => request("/history/leaderboard"),
};
