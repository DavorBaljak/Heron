import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createMockLoxoneServer } from "@heron/loxone-mock";
import { LoxoneClient } from "./client.js";

let mockServer: Server;
let client: LoxoneClient;

before(async () => {
  mockServer = createMockLoxoneServer();
  await new Promise<void>((resolve) => mockServer.listen(0, resolve));
  const { port } = mockServer.address() as AddressInfo;
  client = new LoxoneClient({ host: `localhost:${port}`, user: "test", password: "test" });
});

after(async () => {
  await client.close();
  await new Promise<void>((resolve) => mockServer.close(() => resolve()));
});

test("authenticates and fetches structure from the mock Miniserver", async () => {
  const structure = await client.getStructure();

  assert.equal(Object.keys(structure.rooms).length, 14);
  assert.equal(structure.rooms["room-living"]?.name, "Living Room");

  assert.equal(Object.keys(structure.cats).length, 9);
  assert.equal(structure.cats["cat-lighting"]?.type, "lights");

  assert.equal(Object.keys(structure.controls).length, 43);
  assert.equal(structure.controls["ctrl-living-light"]?.room, "room-living");
  assert.equal(structure.controls["ctrl-utility-meter"]?.cat, "cat-energy");
  assert.equal(structure.controls["ctrl-solar-array-east"]?.room, "room-roof");
  assert.equal(structure.controls["ctrl-well-inlet"]?.room, "room-wells");
  assert.equal(structure.controls["ctrl-perimeter-gate"]?.room, "room-perimeter");
});

test("caches the structure between calls within the TTL", async () => {
  const first = await client.getStructure();
  const second = await client.getStructure();
  assert.equal(first, second);
});

test("lists scenes from the mock Miniserver", async () => {
  const scenes = await client.listScenes();
  assert.equal(scenes.length, 6);
  assert.ok(scenes.some((scene) => scene.id === "scene-severe-weather"));
});

test("concurrent calls on a freshly-constructed client don't race the auth handshake", async () => {
  const freshServer = createMockLoxoneServer();
  await new Promise<void>((resolve) => freshServer.listen(0, resolve));
  const { port } = freshServer.address() as AddressInfo;
  const freshClient = new LoxoneClient({ host: `localhost:${port}`, user: "test", password: "test" });

  // Regression test: firing several discovery calls at once (as the agent's
  // fetchDiscoverySnapshot does via Promise.all) used to trigger overlapping
  // getkey2/gettoken handshakes that clobbered each other in the mock,
  // causing spurious 401s. All of these should now share one auth flow.
  const [structureA, structureB, scenes] = await Promise.all([
    freshClient.getStructure(),
    freshClient.getStructure(),
    freshClient.listScenes(),
  ]);

  assert.equal(structureA, structureB);
  assert.equal(scenes.length, 6);

  await freshClient.close();
  await new Promise<void>((resolve) => freshServer.close(() => resolve()));
});

test("sendCommand mutates real device state, and rejects an unknown control", async () => {
  assert.equal(await client.getLiveState("state-office-light-active"), 0);

  const result = await client.sendCommand("ctrl-office-light", "on");
  assert.equal(result, "on");

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(await client.getLiveState("state-office-light-active"), 1);

  await assert.rejects(() => client.sendCommand("ctrl-does-not-exist", "on"), /Unknown control/);
});

test("activateScene applies a scene's bundle of writes, and rejects an unknown scene", async () => {
  const result = await client.activateScene("scene-good-morning");
  assert.equal(result.sceneId, "scene-good-morning");
  assert.equal(result.actionsApplied, 4);

  await assert.rejects(() => client.activateScene("scene-does-not-exist"), /Unknown scene/);
});
