import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import type { Session, SessionHooks } from "@heron/agent/dist/session.js";
import WebSocket from "ws";
import { createGatewayServer } from "./server.js";

const TOKEN = "test-pairing-token";

const fakeSession: Session = {
  async handleMessage(text: string, hooks: SessionHooks) {
    if (text === "do the thing") {
      const approved = await hooks.confirmAction("set_control_state", { uuid: "ctrl-x", command: "on" });
      return approved ? "did it" : "declined";
    }
    return `echo: ${text}`;
  },
  async refreshDiscovery() {
    return { fetchedAt: new Date().toISOString(), rooms: [], categories: [], controls: [], scenes: [] };
  },
};

let server: Server;
let wsUrl: string;

before(async () => {
  server = createGatewayServer({ session: fakeSession, token: TOKEN });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  wsUrl = `ws://localhost:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function nextMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => ws.once("message", (data) => resolve(JSON.parse(data.toString()))));
}

test("rejects connections that don't authenticate with the correct token", async () => {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve) => ws.on("open", resolve));
  ws.send(JSON.stringify({ type: "auth", token: "wrong-token" }));
  const reply = await nextMessage(ws);
  assert.equal(reply.type, "error");
  ws.close();
});

test("authenticates and echoes a message round-trip", async () => {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve) => ws.on("open", resolve));

  ws.send(JSON.stringify({ type: "auth", token: TOKEN }));
  assert.equal((await nextMessage(ws)).type, "auth_ok");

  ws.send(JSON.stringify({ type: "message", text: "hello" }));
  const reply = await nextMessage(ws);
  assert.equal(reply.type, "response");
  assert.equal(reply.text, "echo: hello");

  ws.close();
});

test("action-tier confirm_request/confirm_response round-trip (approved)", async () => {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve) => ws.on("open", resolve));
  ws.send(JSON.stringify({ type: "auth", token: TOKEN }));
  await nextMessage(ws);

  ws.send(JSON.stringify({ type: "message", text: "do the thing" }));
  const confirmRequest = await nextMessage(ws);
  assert.equal(confirmRequest.type, "confirm_request");
  assert.equal(confirmRequest.tool, "set_control_state");

  ws.send(JSON.stringify({ type: "confirm_response", approved: true }));
  const reply = await nextMessage(ws);
  assert.equal(reply.type, "response");
  assert.equal(reply.text, "did it");

  ws.close();
});

test("action-tier confirm_request/confirm_response round-trip (declined)", async () => {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve) => ws.on("open", resolve));
  ws.send(JSON.stringify({ type: "auth", token: TOKEN }));
  await nextMessage(ws);

  ws.send(JSON.stringify({ type: "message", text: "do the thing" }));
  await nextMessage(ws); // confirm_request

  ws.send(JSON.stringify({ type: "confirm_response", approved: false }));
  const reply = await nextMessage(ws);
  assert.equal(reply.text, "declined");

  ws.close();
});
