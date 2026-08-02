import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import WebSocket from "ws";
import { createDashboardServer } from "./server.js";
import type { StateUpdate } from "./poll.js";

const fakeSnapshot = {
  structure: {
    rooms: [{ uuid: "room-1", name: "Living Room" }],
    categories: [{ uuid: "cat-1", name: "Lights", type: "lights" }],
    controls: [{ uuid: "ctrl-1", name: "Living Light", type: "Dimmer", room: "room-1", cat: "cat-1", states: { position: "state-1" } }],
  },
  states: { "ctrl-1": { position: 42 } },
};

let listener: ((update: StateUpdate) => void) | undefined;

let server: Server;
let baseUrl: string;
let wsUrl: string;

before(async () => {
  server = createDashboardServer({
    getSnapshot: () => fakeSnapshot,
    subscribe: (onUpdate) => {
      listener = onUpdate;
      return () => {
        listener = undefined;
      };
    },
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
  wsUrl = `ws://localhost:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("GET /api/snapshot returns the current structure and state", async () => {
  const res = await fetch(`${baseUrl}/api/snapshot`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, fakeSnapshot);
});

test("GET / serves the dashboard's static index.html", async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/html/);
});

test("broadcasts a state update to connected WebSocket clients", async () => {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve) => ws.on("open", resolve));

  const messagePromise = new Promise((resolve) => ws.once("message", (data) => resolve(JSON.parse(data.toString()))));

  assert.ok(listener, "server should have subscribed a broadcast listener");
  listener!({ uuid: "ctrl-1", key: "position", value: 77 });

  const message = await messagePromise;
  assert.deepEqual(message, { type: "state_update", uuid: "ctrl-1", key: "position", value: 77 });

  ws.close();
});
