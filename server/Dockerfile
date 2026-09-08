# --- Build stage: compiles native deps (better-sqlite3 needs a C++ toolchain) ---
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# --- Runtime stage: no build toolchain, smaller image, non-root user ---
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN groupadd --gid 1001 app && useradd --uid 1001 --gid 1001 --home /app --no-create-home app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY package*.json ./

# /app/data is where the SQLite file lives — a PVC mounts here in k8s.
RUN mkdir -p /app/data && chown -R app:app /app

USER app
EXPOSE 4000

CMD ["node", "src/index.js"]
