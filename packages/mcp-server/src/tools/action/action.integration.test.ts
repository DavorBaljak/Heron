import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { createMockLoxoneServer } from "@heron/loxone-mock";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { LoxoneClient } from "../../loxone/client.js";
import { registerMonitoringTools } from "../monitoring/index.js";
import { registerActionTools } from "./index.js";

let mockServer: Server;
let loxoneClient: LoxoneClient;
let mcpClient: Client;

before(async () => {
  mockServer = createMockLoxoneServer();
  await new Promise<void>((resolve) => mockServer.listen(0, resolve));
  const { port } = mockServer.address() as AddressInfo;

  loxoneClient = new LoxoneClient({ host: `localhost:${port}`, user: "test", password: "test" });

  const server = new McpServer({ name: "test-server", version: "0.0.1" });
  registerActionTools(server, loxoneClient);
  registerMonitoringTools(server, loxoneClient);

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  mcpClient = new Client({ name: "test-client", version: "0.0.1" });
  await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
});

after(async () => {
  await mcpClient.close();
  await loxoneClient.close();
  await new Promise<void>((resolve) => mockServer.close(() => resolve()));
});

// The MCP tool layer itself does not gate on confirmation — that's the
// agent's responsibility (packages/agent/src/index.ts's ACTION_TOOL_NAMES
// check). These tools execute immediately when called, as they must for a
// trusted caller that has already obtained confirmation.

test("set_control_state sends a real command and errors for an unknown control", async () => {
  const result = await mcpClient.callTool({
    name: "set_control_state",
    arguments: { uuid: "ctrl-hallway-light", command: "on" },
  });
  assert.notEqual(result.isError, true);

  const unknown = await mcpClient.callTool({
    name: "set_control_state",
    arguments: { uuid: "ctrl-does-not-exist", command: "on" },
  });
  assert.equal(unknown.isError, true);
});

test("activate_scene applies a scene and errors for an unknown scene id", async () => {
  const result = await mcpClient.callTool({ name: "activate_scene", arguments: { id: "scene-movie-night" } });
  const body = JSON.parse((result.content as Array<{ text: string }>)[0].text);
  assert.equal(body.sceneId, "scene-movie-night");
  assert.ok(body.actionsApplied > 0);

  const unknown = await mcpClient.callTool({ name: "activate_scene", arguments: { id: "scene-does-not-exist" } });
  assert.equal(unknown.isError, true);
});
