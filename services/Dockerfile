# syntax=docker/dockerfile:1.7
# One image recipe for every backend service: `--build-arg SERVICE=<name>`, build context = repo root.
# The result is a single bundled file, so the runtime image carries no node_modules.

FROM node:22-alpine AS build
ARG SERVICE
WORKDIR /app
COPY tsconfig.base.json ./
COPY shared/contracts/package.json shared/contracts/package-lock.json shared/contracts/
COPY shared/service-kit/package.json shared/service-kit/package-lock.json shared/service-kit/
COPY shared/portrait/package.json shared/portrait/
COPY services/${SERVICE}/package.json services/${SERVICE}/package-lock.json services/${SERVICE}/
RUN --mount=type=cache,target=/root/.npm \
    (cd shared/contracts && npm ci) && \
    (cd shared/service-kit && npm ci) && \
    (cd services/${SERVICE} && npm ci)
COPY shared shared
COPY services/${SERVICE} services/${SERVICE}
RUN cd services/${SERVICE} && npm run build && mkdir -p drizzle

FROM node:22-alpine AS runtime
ARG SERVICE
ENV NODE_ENV=production
WORKDIR /srv
RUN mkdir -p /data && chown node:node /data
COPY --from=build /app/services/${SERVICE}/dist ./dist
COPY --from=build /app/services/${SERVICE}/drizzle ./drizzle
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1
CMD ["node", "--enable-source-maps", "dist/main.js"]
