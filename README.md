# AWS Exam Simulator

A production-style AWS certification practice application with:

- React + Vite frontend
- Node.js + Express API
- JWT authentication
- Email + password registration/login
- bcrypt password hashing
- MongoDB Atlas for users, exam sessions and attempt history
- Private history + shared leaderboard
- Docker + Kubernetes (k3s) deployment
- GitHub Actions + Jenkins deployment flow
- AWS-focused UI with application branding and icons

> The question bank is original practice content based on AWS exam-guide domains. It is not real AWS exam content.

## 1. MongoDB Atlas

Create a free MongoDB Atlas cluster and database user.

In Atlas:
1. Create a cluster.
2. Create a database user.
3. Network Access: allow your EC2 public IP (or `0.0.0.0/0` temporarily for a learning/demo environment).
4. Copy the SRV connection string.
5. URL-encode special characters in the database username/password.

Example server environment:

```env
PORT=4000
JWT_SECRET=<long-random-secret>
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=aws_exam_simulator
CORS_ORIGIN=http://localhost:5173
```

## 2. Local development

Backend:

```bash
cd server
cp .env.example .env
# fill in MONGODB_URI and JWT_SECRET
npm install
npm run dev
```

Frontend:

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`.

Registration now collects full name, email, password and password confirmation. Passwords are never stored in plain text.

## 3. Use a real application name instead of an EC2 IP

The application is branded as **AWS Exam Simulator** throughout the UI, page title and favicon.

For the browser address itself, an EC2 IP can only be replaced by a DNS hostname if you own/control a domain.

Recommended production setup:

```text
aws-exam.yourdomain.com
        |
        v
DNS A record -> EC2 Elastic IP
        |
        v
k3s / Traefik Ingress
        |
        v
React + Express + MongoDB Atlas
```

Create an A record such as:

```text
aws-exam.yourdomain.com -> <EC2 Elastic IP>
```

Then replace `REPLACE_WITH_YOUR_DOMAIN` in `k8s/ingress.yaml`.

For HTTPS, use a valid TLS certificate (for example with cert-manager + Let's Encrypt, or terminate TLS through Cloudflare).

## 4. Kubernetes secrets

Do not commit MongoDB credentials.

Create the production secret:

```bash
sudo k3s kubectl create secret generic app-secrets -n aws-exam   --from-literal=JWT_SECRET="<long-random-secret>"   --from-literal=MONGODB_URI="mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority"
```

The server reads:

- `MONGODB_URI`
- `MONGODB_DB`
- `JWT_SECRET`

The old SQLite database is no longer used.

## 5. GitHub Actions / Jenkins

Add these GitHub Actions secrets:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`
- `EC2_HOST`
- `EC2_USER`
- `EC2_SSH_KEY`
- `JWT_SECRET`
- `MONGODB_URI`

The workflow builds the server/client images, smoke-tests the server against a temporary MongoDB service, pushes images to Docker Hub, updates the k3s deployment and performs a health check.

## Security notes

This is suitable for a portfolio/learning application. For a production system, add email verification, password reset, MFA, stronger session management, audit logging and additional abuse/CSRF protections.

Never put MongoDB Atlas credentials, JWT secrets, SSH private keys or `.env` files into Git.
