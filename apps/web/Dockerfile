# syntax=docker/dockerfile:1
# Build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg API_URL=http://api:4000 .
# API_URL is read at build time (the /api rewrite is compiled into the build) and at run time
# (pages rendered on the server call it directly), so pass the same value to both.

FROM node:24-alpine AS build
RUN npm install --global pnpm@10.28.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
ARG API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN test -n "$API_URL" || { echo 'Set --build-arg API_URL to the API base URL.' >&2; exit 1; }
RUN API_URL="$API_URL" pnpm --filter @cartforge/web build
# A self-contained copy of the web app with production dependencies only, plus the build.
RUN pnpm --filter @cartforge/web deploy --prod --legacy /out \
  && rm -rf /out/.next && cp -r apps/web/.next /out/.next && rm -rf /out/.next/cache

FROM node:24-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/" || exit 1
CMD ["node_modules/.bin/next", "start"]
