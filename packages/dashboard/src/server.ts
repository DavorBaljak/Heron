import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import type { DashboardStructure } from "./discovery.js";
import type { StateUpdate } from "./poll.js";

export interface Snapshot {
  structure: DashboardStructure;
  /** control uuid -> {state key -> live value} */
  states: Record<string, Record<string, number | string>>;
}

export interface DashboardServerOptions {
  getSnapshot: () => Snapshot;
  /** Registers a listener for state changes; returns an unsubscribe function. */
  subscribe: (onUpdate: (update: StateUpdate) => void) => () => void;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(here, "../public");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function serveStatic(pathname: string, res: import("node:http").ServerResponse): Promise<void> {
  const relative = pathname === "/" ? "/index.html" : pathname;
  const fullPath = path.join(PUBLIC_DIR, path.normalize(relative));
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const data = await readFile(fullPath);
    const contentType = MIME_TYPES[path.extname(fullPath)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

/**
 * Read-only dashboard: no auth, no action-tier tools — same LAN-only trust
 * boundary ARCHITECTURE.md assumes for the rest of Heron. It only ever
 * displays state, never changes it.
 */
export function createDashboardServer(options: DashboardServerOptions): Server {
  const { getSnapshot, subscribe } = options;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/api/snapshot") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(getSnapshot()));
      return;
    }
    void serveStatic(url.pathname, res);
  });

  const wss = new WebSocketServer({ server });
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
  });

  subscribe((update) => {
    const payload = JSON.stringify({ type: "state_update", ...update });
    for (const client of clients) {
      if (client.readyState === client.OPEN) client.send(payload);
    }
  });

  return server;
}
