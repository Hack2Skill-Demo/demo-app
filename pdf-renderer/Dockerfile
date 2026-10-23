# Build context is this directory: gcloud run deploy pdf-renderer --source pdf-renderer
# Node is pinned to an exact patch: a custom image gets no automatic base-image updates from Cloud Run, and 22.23.4
# is the first 22.x with the Node2Shell fix (CVE-2026-111497, a Brotli decoder RCE).
FROM node:22.23.4-slim AS build
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npx tsc

FROM node:22.23.4-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
CMD ["node", "dist/server.js"]
