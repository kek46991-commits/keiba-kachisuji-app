FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends mariadb-server ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN corepack enable \
  && pnpm install --frozen-lockfile \
  && pnpm build

ENV NODE_ENV=production
EXPOSE 10000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
