FROM node:26-bookworm-slim AS node-runtime

FROM node:26-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY mcp/package.json mcp/
COPY web/package.json web/
RUN npm ci

FROM node:26-bookworm-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends zip unzip ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run prepare:assets && npm run build

FROM node:26-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY mcp/package.json mcp/
COPY web/package.json web/
RUN npm ci --omit=dev && npm cache clean --force

FROM gcr.io/distroless/cc-debian12:nonroot AS runtime
WORKDIR /app
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /lib/x86_64-linux-gnu/libatomic.so.1 /lib/x86_64-linux-gnu/libatomic.so.1
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/mcp/dist ./mcp/dist
COPY --from=build /app/web/dist ./web/dist
ENV NODE_ENV=production \
    HOME=/tmp \
    PORT=3333 \
    HOST=0.0.0.0 \
    WORKSPACE_DIR=/workspace \
    WEB_DIR=/app/web/dist
EXPOSE 3333
USER 1000:1000
ENTRYPOINT ["/usr/local/bin/node"]
CMD ["mcp/dist/index.js"]
