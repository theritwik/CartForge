# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f apps/api/Dockerfile .

FROM node:24-alpine AS build
RUN npm install --global pnpm@10.28.0
WORKDIR /repo
COPY . .
# Installs the API and its workspace dependency (@cartforge/db), generates the Prisma client.
RUN pnpm install --frozen-lockfile --filter @cartforge/api...
RUN pnpm --filter @cartforge/api... build
# A self-contained copy of the API with production dependencies only.
RUN pnpm --filter @cartforge/api deploy --prod --legacy /out

# One-off job that applies pending migrations: docker run --rm <image> with target "migrate".
FROM build AS migrate
WORKDIR /repo/packages/db
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
  CMD wget -q -O /dev/null "http://127.0.0.1:${API_PORT:-4000}/health/live" || exit 1
CMD ["node", "dist/server.js"]
