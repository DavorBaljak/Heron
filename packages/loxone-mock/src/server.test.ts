import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import WebSocket from "ws";
import { createMockLoxoneServer } from "./server.js";

let server: Server;
let baseUrl: string;
let wsUrl: string;

before(async () => {
  server = createMockLoxoneServer({ credentials: { user: "test", password: "test" } });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
  wsUrl = `ws://localhost:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function getJson(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  return { status: res.status, body: res.status === 200 ? ((await res.json()) as any) : undefined };
}

async function authenticate(user: string, password: string) {
  const { body: keyBody } = await getJson(`/jdev/sys/getkey2/${user}`);
  const { key, salt } = keyBody.LL.value;
  const pwHash = createHash("sha1").update(`${password}:${salt}`).digest("hex").toUpperCase();
  const hash = createHmac("sha1", Buffer.from(key, "hex")).update(`${user}:${pwHash}`).digest("hex");
  return getJson(`/jdev/sys/gettoken/${hash}/${user}/2/test-client/Test`);
}

test("rejects gettoken with a wrong password", async () => {
  const { status } = await authenticate("test", "wrong-password");
  assert.equal(status, 401);
});

test("issues a token for the correct password and allows fetching the structure", async () => {
  const { status, body } = await authenticate("test", "test");
  assert.equal(status, 200);
  const token = body.LL.value.token as string;
  assert.ok(token);

  const structureRes = await fetch(`${baseUrl}/data/LoxAPP3.json`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(structureRes.status, 200);
  const structure = await structureRes.json();
  assert.ok(structure.controls["ctrl-living-light"]);
});

test("rejects structure fetch without a valid token", async () => {
  const res = await fetch(`${baseUrl}/data/LoxAPP3.json`);
  assert.equal(res.status, 401);
});

test("command endpoint mutates device state and rejects without a token", async () => {
  const { body } = await authenticate("test", "test");
  const token = body.LL.value.token as string;

  const unauthorized = await fetch(`${baseUrl}/jdev/sps/io/ctrl-living-light/on`);
  assert.equal(unauthorized.status, 401);

  const res = await fetch(`${baseUrl}/jdev/sps/io/ctrl-master-light/on`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
});

test("websocket push delivers a state update after a command", async () => {
  const { body } = await authenticate("test", "test");
  const token = body.LL.value.token as string;

  const ws = new WebSocket(`${wsUrl}/ws/rfc6455?token=${token}`);
  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });

  const updatePromise = new Promise<{ uuid: string; value: number | string }>((resolve) => {
    ws.on("message", (data) => resolve(JSON.parse(data.toString())));
  });

  await fetch(`${baseUrl}/jdev/sps/io/ctrl-kids-light/on`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const update = await updatePromise;
  assert.equal(update.uuid, "state-kids-light-active");
  assert.equal(update.value, 1);

  ws.close();
});

test("lists scenes and rejects without a token", async () => {
  const unauthorized = await fetch(`${baseUrl}/jdev/sps/scenes`);
  assert.equal(unauthorized.status, 401);

  const { body } = await authenticate("test", "test");
  const token = body.LL.value.token as string;
  const { status, body: scenesBody } = await getJson("/jdev/sps/scenes", { Authorization: `Bearer ${token}` });
  assert.equal(status, 200);
  const scenes = scenesBody.LL.value as Array<{ id: string; name: string }>;
  assert.ok(scenes.some((scene) => scene.id === "scene-severe-weather"));
});

test("activating the severe-weather scene closes blinds and starts freeze protection", async () => {
  const { body } = await authenticate("test", "test");
  const token = body.LL.value.token as string;

  const unauthorized = await fetch(`${baseUrl}/jdev/sps/scene/scene-severe-weather`);
  assert.equal(unauthorized.status, 401);

  const ws = new WebSocket(`${wsUrl}/ws/rfc6455?token=${token}`);
  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });

  const updates: Array<{ uuid: string; value: number | string }> = [];
  const gotAllUpdates = new Promise<void>((resolve) => {
    ws.on("message", (data) => {
      updates.push(JSON.parse(data.toString()));
      if (updates.length === 14) resolve();
    });
  });

  const res = await fetch(`${baseUrl}/jdev/sps/scene/scene-severe-weather`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  const resBody = (await res.json()) as { LL: { value: { actionsApplied: number } } };
  assert.equal(resBody.LL.value.actionsApplied, 14);

  await gotAllUpdates;
  ws.close();

  const blindUpdate = updates.find((u) => u.uuid === "state-living-blind-position");
  assert.equal(blindUpdate?.value, 100);
  const poolPumpUpdate = updates.find((u) => u.uuid === "state-pool-pump-active");
  assert.equal(poolPumpUpdate?.value, 1);
  const irrigationUpdate = updates.find((u) => u.uuid === "state-terrace-irrigation-active");
  assert.equal(irrigationUpdate?.value, 0);

  const unknown = await fetch(`${baseUrl}/jdev/sps/scene/scene-does-not-exist`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(unknown.status, 404);
});

test("history endpoint returns ~90 days of samples and rejects without a token", async () => {
  const unauthorized = await fetch(`${baseUrl}/jdev/sps/history/state-living-climate-temp`);
  assert.equal(unauthorized.status, 401);

  const { body } = await authenticate("test", "test");
  const token = body.LL.value.token as string;

  const { status, body: historyBody } = await getJson("/jdev/sps/history/state-living-climate-temp", {
    Authorization: `Bearer ${token}`,
  });
  assert.equal(status, 200);
  const samples = historyBody.LL.value as Array<{ timestamp: number; value: number }>;
  assert.ok(samples.length > 2000, `expected ~90 days of hourly samples, got ${samples.length}`);
  assert.ok(samples.every((sample) => typeof sample.value === "number" && sample.value > 10 && sample.value < 30));

  const unknownState = await fetch(`${baseUrl}/jdev/sps/history/state-does-not-exist`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(unknownState.status, 404);
});

test("history endpoint filters by from/to (unix seconds)", async () => {
  const { body } = await authenticate("test", "test");
  const token = body.LL.value.token as string;

  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - 24 * 3600;
  const { body: historyBody } = await getJson(
    `/jdev/sps/history/state-solar-east-power?from=${oneDayAgo}&to=${now}`,
    { Authorization: `Bearer ${token}` },
  );
  const samples = historyBody.LL.value as Array<{ timestamp: number; value: number }>;
  assert.ok(samples.length > 0 && samples.length <= 26);
  assert.ok(samples.every((sample) => sample.timestamp >= oneDayAgo * 1000 && sample.timestamp <= now * 1000));
});
