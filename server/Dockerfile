FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN groupadd --gid 1001 app && useradd --uid 1001 --gid 1001 --home /app --no-create-home app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src
RUN chown -R app:app /app

USER app
EXPOSE 4000

CMD ["node", "src/index.js"]
