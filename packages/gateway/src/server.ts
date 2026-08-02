import { createServer, type Server } from "node:http";
import type { Session } from "@heron/agent/dist/session.js";
import { WebSocketServer } from "ws";

export interface GatewayOptions {
  session: Session;
  token: string;
}

interface ClientMessage {
  type: string;
  token?: string;
  text?: string;
}

/**
 * WebSocket protocol (this project's own — not a standard):
 *   client -> {type:"auth", token}                              (must be first message)
 *   server -> {type:"auth_ok"} | {type:"error", message}
 *   client -> {type:"message", text}
 *   server -> {type:"tool_call", tool}                           (zero or more, informational)
 *   server -> {type:"response", text}                            (final reply for this message)
 *
 * Action-tier calls are auto-approved here rather than round-tripping a
 * confirm_request/confirm_response — the user's spoken command that led
 * Claude to call the tool *is* the confirmation for this voice client, so a
 * second tap-to-confirm on the phone would just be a redundant echo of what
 * they already said.
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

      if (msg.type === "message" && msg.text !== undefined) {
        try {
          const reply = await session.handleMessage(msg.text, {
            onToolCall: (toolName) => ws.send(JSON.stringify({ type: "tool_call", tool: toolName })),
            // Auto-approve: the spoken command that made Claude call this
            // tool already is the user's confirmation for this voice client.
            confirmAction: () => Promise.resolve(true),
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
