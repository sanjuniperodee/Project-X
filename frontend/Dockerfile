# syntax=docker/dockerfile:1.7
# Next.js frontend. Build context = repo root (the shared contracts live outside this folder):
#   docker build -f frontend/Dockerfile .

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY shared/contracts/package.json shared/contracts/package-lock.json shared/contracts/
COPY shared/portrait/package.json shared/portrait/
COPY frontend/package.json frontend/package-lock.json frontend/
RUN --mount=type=cache,target=/root/.npm \
    (cd shared/contracts && npm ci) && \
    (cd frontend && npm ci)
COPY shared/contracts shared/contracts
COPY shared/portrait shared/portrait
COPY frontend frontend
# Pages render on demand, so the build needs no running API.
RUN cd frontend && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Standalone output: a minimal server with only the traced dependencies.
COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static ./frontend/.next/static
COPY --from=build --chown=node:node /app/frontend/public ./frontend/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/" >/dev/null || exit 1
CMD ["node", "frontend/server.js"]
