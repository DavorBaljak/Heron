import { createServer, type Server } from "node:http";
import type { Session } from "@heron/agent/dist/session.js";
import { WebSocketServer } from "ws";

export interface GatewayOptions {
  session: Session;
  token: string;
}

const CONFIRM_TIMEOUT_MS = 60_000;

interface ClientMessage {
  type: string;
  token?: string;
  text?: string;
  approved?: boolean;
}

/**
 * WebSocket protocol (this project's own — not a standard):
 *   client -> {type:"auth", token}                              (must be first message)
 *   server -> {type:"auth_ok"} | {type:"error", message}
 *   client -> {type:"message", text}
 *   server -> {type:"tool_call", tool}                           (zero or more, informational)
 *   server -> {type:"confirm_request", tool, arguments}          (zero or more, action-tier only)
 *   client -> {type:"confirm_response", approved}                (reply to each confirm_request)
 *   server -> {type:"response", text}                            (final reply for this message)
 */
export function createGatewayServer(options: GatewayOptions): Server {
  const { session, token } = options;

  const server = createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    let authenticated = false;
    let pendingConfirm: { resolve: (approved: boolean) => void; timer: NodeJS.Timeout } | undefined;

    ws.on("message", async (data) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      if (!authenticated) {
        if (msg.type === "auth" && msg.token === token) {
          authenticated = true;
          ws.send(JSON.stringify({ type: "auth_ok" }));
        } else {
          ws.send(JSON.stringify({ type: "error", message: "Unauthorized" }));
          ws.close();
        }
        return;
      }

      if (msg.type === "confirm_response") {
        if (pendingConfirm) {
          clearTimeout(pendingConfirm.timer);
          pendingConfirm.resolve(msg.approved === true);
          pendingConfirm = undefined;
        }
        return;
      }

      if (msg.type === "message" && msg.text !== undefined) {
        try {
          const reply = await session.handleMessage(msg.text, {
            onToolCall: (toolName) => ws.send(JSON.stringify({ type: "tool_call", tool: toolName })),
            confirmAction: (toolName, args) =>
              new Promise<boolean>((resolve) => {
                const timer = setTimeout(() => {
                  pendingConfirm = undefined;
                  resolve(false);
                }, CONFIRM_TIMEOUT_MS);
                timer.unref();
                pendingConfirm = { resolve, timer };
                ws.send(JSON.stringify({ type: "confirm_request", tool: toolName, arguments: args }));
              }),
          });
          ws.send(JSON.stringify({ type: "response", text: reply }));
        } catch (error) {
          ws.send(JSON.stringify({ type: "error", message: error instanceof Error ? error.message : String(error) }));
        }
      }
    });
  });

  return server;
}
