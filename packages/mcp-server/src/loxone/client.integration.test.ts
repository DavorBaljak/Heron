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

  assert.equal(Object.keys(structure.rooms).length, 10);
  assert.equal(structure.rooms["room-living"]?.name, "Living Room");

  assert.equal(Object.keys(structure.cats).length, 7);
  assert.equal(structure.cats["cat-lighting"]?.type, "lights");

  assert.equal(Object.keys(structure.controls).length, 30);
  assert.equal(structure.controls["ctrl-living-light"]?.room, "room-living");
  assert.equal(structure.controls["ctrl-utility-meter"]?.cat, "cat-energy");
});

test("caches the structure between calls within the TTL", async () => {
  const first = await client.getStructure();
  const second = await client.getStructure();
  assert.equal(first, second);
});
