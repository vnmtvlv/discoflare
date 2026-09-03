# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS build

RUN npm install --global pnpm@10.30.3

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:24-bookworm-slim AS runtime

LABEL org.opencontainers.image.source="https://github.com/vnmtvlv/discoflare"
LABEL org.opencontainers.image.description="Discoflare self-hosted team chat"
LABEL org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    CI=true \
    CLOUDFLARE_CF_FETCH_ENABLED=false \
    WRANGLER_SEND_METRICS=false

WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/wrangler.dev.jsonc ./wrangler.dev.jsonc
COPY --from=build --chown=node:node /app/scripts/start-selfhost.mjs ./scripts/start-selfhost.mjs

RUN mkdir -p /app/.wrangler /data && chown node:node /app/.wrangler /data

USER node

EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "scripts/start-selfhost.mjs"]
