# Builds all workspaces once, then runtime images share that build:
# - loxone-mock: the mock Miniserver, standalone.
# - heron: the agent, which spawns mcp-server itself as a child process over
#   stdio (see packages/agent/src/mcpClient.ts) — it is never a separate
#   networked service, so it stays bundled with mcp-server in one image.
# - gateway: WebSocket bridge for the Android app, also spawns its own
#   mcp-server child process, same reasoning as heron.

FROM node:22-slim AS base
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/mcp-server/package.json packages/mcp-server/package.json
COPY packages/agent/package.json packages/agent/package.json
COPY packages/gateway/package.json packages/gateway/package.json
COPY packages/loxone-mock/package.json packages/loxone-mock/package.json
RUN npm ci
COPY packages ./packages
RUN npm run build

FROM node:22-slim AS loxone-mock
WORKDIR /app
COPY --from=base /app /app
ENV PORT=8080
EXPOSE 8080
CMD ["node", "packages/loxone-mock/dist/index.js"]

FROM node:22-slim AS heron
WORKDIR /app
COPY --from=base /app /app
ENV MCP_SERVER_ENTRY=/app/packages/mcp-server/dist/index.js
CMD ["node", "packages/agent/dist/index.js"]

FROM node:22-slim AS gateway
WORKDIR /app
COPY --from=base /app /app
ENV MCP_SERVER_ENTRY=/app/packages/mcp-server/dist/index.js
EXPOSE 8090
CMD ["node", "packages/gateway/dist/index.js"]
