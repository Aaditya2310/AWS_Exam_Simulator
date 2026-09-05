# ☁️ AWS Exam Simulator

A full-stack practice-exam simulator for AWS certifications, featuring real user accounts, JWT authentication, server-side grading, private exam history, and a shared leaderboard.

> **Important:** All question content is original and written to align with AWS's published exam-guide domains and weightings. It is **not real AWS exam content**. AWS exam questions are confidential and copyrighted and are not reproduced here.

---

## ✨ Features

* 🔐 **User authentication**

  * Account registration and login
  * bcrypt-hashed passwords
  * JWT-based sessions
  * Protected API routes
  * Authentication rate limiting

* 📝 **Server-graded exams**

  * Questions are served without revealing correct answers
  * Answers are submitted to and graded by the backend
  * Exam sessions cannot be resubmitted after completion

* 📊 **Exam history**

  * Each user has a private history of their completed exams
  * Scores and results are persisted in SQLite

* 🏆 **Shared leaderboard**

  * Compare scores across accounts
  * Leaderboard is intentionally visible to all registered users

* 🌐 **Separate frontend/backend**

  * React + Vite frontend
  * Node.js + Express API
  * CORS configured for separate deployment origins

* 💾 **Persistent SQLite storage**

  * Lightweight database using `better-sqlite3`
  * Designed to work with a persistent Railway volume

* 🚀 **Production-ready build**

  * Frontend production build tested successfully
  * Backend and frontend can be deployed as separate Railway services

---

## 🛠️ Tech Stack

| Layer                 | Technology              |
| --------------------- | ----------------------- |
| Frontend              | React + Vite            |
| Backend               | Node.js + Express       |
| Database              | SQLite + better-sqlite3 |
| Authentication        | JWT                     |
| Password hashing      | bcrypt                  |
| Deployment            | Railway                 |
| Frontend architecture | Separate SPA + REST API |

---

## 📁 Project Structure

```text
AWS_Exam_Simulator/
├── server/                 # Node.js + Express API
│   ├── ...
│   ├── .env.example
│   └── package.json
│
├── client/                 # React + Vite frontend
│   ├── ...
│   ├── .env.example
│   └── package.json
│
└── README.md
```

---

# 🚀 Run Locally

## 1. Start the Backend

```bash
cd server
cp .env.example .env
```

Edit `.env` and set a strong, unique `JWT_SECRET`.

The `.env.example` file contains a command for generating a secure secret.

Then install dependencies and start the development server:

```bash
npm install
npm run dev
```

The API runs on:

```text
http://localhost:4000
```

---

## 2. Start the Frontend

Open a second terminal:

```bash
cd client
cp .env.example .env
```

Set the API URL in `.env`:

```env
VITE_API_URL=http://localhost:4000/api
```

Install dependencies and start Vite:

```bash
npm install
npm run dev
```

The frontend runs on:

```text
http://localhost:5173
```

Open the frontend in your browser, create an account, and start an exam.

---

# 🧪 End-to-End Testing

The application has been smoke-tested in development across the main authentication, exam, and deployment flows.

Tested functionality includes:

* ✅ User registration
* ✅ Duplicate username rejection
* ✅ Incorrect password rejection
* ✅ JWT-protected API routes
* ✅ Prevention of answer leakage before submission
* ✅ Server-side exam grading
* ✅ Blocking completed exam sessions from being resubmitted
* ✅ Authentication rate limiting
* ✅ Private per-user exam history
* ✅ Shared leaderboard
* ✅ CORS from a separate frontend origin
* ✅ Production frontend build

The application has **not** been deployed to Railway by the project author. Railway deployment must be completed separately using the instructions below.

---

# ☁️ Deploy to Railway

The recommended deployment uses **two Railway services** from the same GitHub repository:

```text
GitHub Repository
│
├── server/  → Railway Backend Service
│
└── client/  → Railway Frontend Service
```

## 1. Push the Project to GitHub

Create a GitHub repository and push the project:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <your-repository-url>
git push -u origin main
```

Railway can then deploy the services directly from the repository.

---

## 2. Create the Backend Service

Create a Railway service from the GitHub repository and configure its **root directory** as:

```text
server/
```

Set these environment variables:

```env
JWT_SECRET=<long-random-secret>
CORS_ORIGIN=<frontend-public-url>
DB_PATH=/data/app.db
```

Railway automatically provides the `PORT` environment variable. The backend already reads `process.env.PORT`.

### Persistent Database Storage

Attach a **persistent Railway volume** and mount it at:

```text
/data
```

This is important because SQLite stores data on disk.

Without a persistent volume, redeploying the backend can wipe:

* User accounts
* Exam history
* Leaderboard data
* Other SQLite database contents

The database should therefore live at:

```text
/data/app.db
```

---

## 3. Create the Frontend Service

Create a second Railway service from the same GitHub repository and set its root directory to:

```text
client/
```

Set:

```env
VITE_API_URL=https://your-backend.up.railway.app/api
```

Replace the example URL with your actual backend Railway URL.

### Build Command

```bash
npm run build
```

The production files will be generated in:

```text
dist/
```

### Serving the Frontend

Use Railway's static-site deployment option if available.

Alternatively, add a production serving script to `client/package.json`:

```json
{
  "scripts": {
    "serve": "vite preview --host --port $PORT"
  }
}
```

Then configure Railway to use:

```bash
npm run serve
```

as the start command.

---

## 4. Configure CORS

Once the frontend has been deployed, copy its public Railway URL.

For example:

```text
https://your-frontend.up.railway.app
```

Return to the backend service and set:

```env
CORS_ORIGIN=https://your-frontend.up.railway.app
```

Redeploy the backend so the updated CORS configuration takes effect.

Your final architecture should look roughly like:

```text
                ┌─────────────────────┐
                │      Browser        │
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │  Railway Frontend   │
                │  React + Vite       │
                └──────────┬──────────┘
                           │ HTTPS / API
                           ▼
                ┌─────────────────────┐
                │  Railway Backend    │
                │  Node + Express     │
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │ Persistent Volume   │
                │ SQLite /data/app.db │
                └─────────────────────┘
```

---

# 🔐 Security Notes

### Passwords

Passwords are stored using **bcrypt hashing** rather than plaintext.

### Authentication

Authenticated API endpoints are protected using JWTs.

### Answer Protection

Correct answers are kept server-side and are not sent to the client before an exam is submitted.

### Session Storage

JWTs are currently stored in `localStorage`.

This keeps the two-domain frontend/backend deployment relatively simple, but it also means that a successful XSS attack could potentially steal a user's session token.

For a portfolio or practice application, this is a reasonable implementation tradeoff. For an application handling highly sensitive information, an `httpOnly` cookie-based authentication design would be preferable.

---

# 📚 Question Bank

The simulator currently contains:

* **30 questions per certification**
* **60 questions total**

Questions are original and designed around the domains and approximate weightings published in AWS certification exam guides.

They are **not copied from AWS exams, dumps, or other confidential sources**.

### Current Coverage

The question bank is intended as a practical starting point rather than an exhaustive exam simulator.

For substantially less repetition during repeated practice, a larger bank of **100+ questions per certification** would be recommended.

---

# 📈 Scoring

Scores are calculated by scaling the number of correct answers linearly onto AWS's **0–1000-style score range**.

Current passing thresholds:

| Certification                                       | Passing Score |
| --------------------------------------------------- | ------------: |
| AWS Certified Cloud Practitioner (CLF)              |           700 |
| AWS Certified Solutions Architect – Associate (SAA) |           720 |

### Important

AWS's actual scoring methodology is not publicly defined as a simple linear calculation.

Therefore, this simulator's score is a **reasonable approximation for practice purposes**, not a prediction or guarantee of an actual AWS exam score.

---

# 🏆 Leaderboard

The leaderboard is intentionally **shared across all accounts** on the deployment.

This allows users to compare their practice performance with other users.

Keep this behavior in mind if the application is later opened to a larger audience and you would prefer scores or identities to remain private.

---

# ⚠️ Known Limitations

| Limitation    | Details                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| JWT storage   | Tokens are stored in `localStorage`, which has greater XSS exposure than `httpOnly` cookies |
| Question bank | 30 questions per certification; repeated practice may become repetitive                     |
| Scoring       | Linear approximation rather than AWS's proprietary scoring methodology                      |
| Leaderboard   | Visible to every registered account                                                         |
| Deployment    | Railway deployment still needs to be completed manually                                     |
| Database      | SQLite requires persistent storage in production                                            |

---

# 🎯 Project Status

**Development:** ✅ Smoke-tested
**Frontend production build:** ✅ Tested
**Authentication:** ✅ Tested
**Exam grading:** ✅ Tested
**History & leaderboard:** ✅ Tested
**Railway deployment:** ⏳ Not yet deployed

---

## 📌 Disclaimer

This project is an independent educational practice tool.

It is **not affiliated with, endorsed by, or sponsored by Amazon Web Services (AWS)**.

All exam questions in this project are original. They are intended to reflect publicly documented certification domains and concepts, not to reproduce confidential AWS examination content.

AWS and related certification names are trademarks of Amazon Web Services, Inc.

