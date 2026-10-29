# Pinned by digest, so a rebuilt tag can't change the image unseen. Keep the
# version in step with .nvmrc.
ARG NODE_IMAGE=node:24.22.0-trixie-slim@sha256:a6155384446670e9719bdc4fd0ebe4d4b29fb32a8d6aa523da3547a6cfbcf22c

# pnpm and every package are fetched once from the lockfile, so both
# installs below run offline and a source change reuses them.
FROM ${NODE_IMAGE} AS manifests
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack install && pnpm fetch
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/core/package.json packages/core/

FROM manifests AS build
RUN pnpm install --frozen-lockfile --offline
COPY . .
RUN pnpm --filter @shylog/server build
# The commit the image is built from, which the You tab shows as the version.
# Declared after the server's build, so the revision alone never rebuilds
# the server; every commit ships a new web bundle.
ARG VITE_REVISION=dev
RUN pnpm --filter @shylog/web build

# The server's runtime dependencies alone. fetch filled node_modules with
# every package, so it starts empty. Core is bundled into the server's build,
# and better-sqlite3 ships a prebuilt binary, so nothing compiles here.
FROM manifests AS deps
RUN rm -rf node_modules \
  && pnpm install --frozen-lockfile --offline --prod --filter @shylog/server

FROM ${NODE_IMAGE}
LABEL org.opencontainers.image.source=https://github.com/tkabalin/shylog
LABEL org.opencontainers.image.licenses=GPL-3.0-or-later
ENV NODE_ENV=production
WORKDIR /app
# pnpm links each package from the root store, so both folders come across
# with the same layout.
COPY --from=deps /src/node_modules node_modules
COPY --from=deps /src/apps/server/node_modules apps/server/node_modules
COPY --from=build /src/apps/server/package.json apps/server/
COPY --from=build /src/apps/server/dist apps/server/dist
COPY --from=build /src/apps/web/dist apps/web/dist
USER node
# A short start interval, so scripts/update.sh sees a new server healthy within
# seconds; the start period leaves room for migrations on a large log.
HEALTHCHECK --interval=30s --timeout=5s --start-period=2m --start-interval=2s \
  CMD ["node", "apps/server/dist/cli.js", "health"]
CMD ["node", "apps/server/dist/index.js"]
