import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { createMockLoxoneServer } from "@heron/loxone-mock";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { LoxoneClient } from "../../loxone/client.js";
import { registerDiscoveryTools } from "../discovery/index.js";
import { registerMonitoringTools } from "./index.js";

let mockServer: Server;
let baseUrl: string;
let loxoneClient: LoxoneClient;
let mcpClient: Client;

async function triggerCommand(uuid: string, command: string): Promise<void> {
  const getJson = async (path: string) => (await (await fetch(`${baseUrl}${path}`)).json()) as any;
  const { LL: { value: { key, salt } } } = await getJson("/jdev/sys/getkey2/test");
  const pwHash = createHash("sha1").update(`test:${salt}`).digest("hex").toUpperCase();
  const hash = createHmac("sha1", Buffer.from(key, "hex")).update(`test:${pwHash}`).digest("hex");
  const tokenBody = await getJson(`/jdev/sys/gettoken/${hash}/test/2/test-client/Test`);
  const token = tokenBody.LL.value.token as string;
  await fetch(`${baseUrl}/jdev/sps/io/${uuid}/${command}`, { headers: { Authorization: `Bearer ${token}` } });
}

before(async () => {
  mockServer = createMockLoxoneServer();
  await new Promise<void>((resolve) => mockServer.listen(0, resolve));
  const { port } = mockServer.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;

  loxoneClient = new LoxoneClient({ host: `localhost:${port}`, user: "test", password: "test" });

  const server = new McpServer({ name: "test-server", version: "0.0.1" });
  registerDiscoveryTools(server, loxoneClient);
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

test("get_control_state reports the initial live value before any change", async () => {
  const result = await mcpClient.callTool({ name: "get_control_state", arguments: { uuid: "ctrl-master-light" } });
  const body = JSON.parse((result.content as Array<{ text: string }>)[0].text);
  assert.equal(body.states.active, 0);
});

test("get_state reflects a change pushed over the mock's WebSocket", async () => {
  await triggerCommand("ctrl-master-light", "on");

  // The mock pushes the update over WS asynchronously; poll briefly for it
  // to land in the client's live-state cache.
  let value: unknown;
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = await mcpClient.callTool({ name: "get_state", arguments: { uuid: "state-master-light-active" } });
    const body = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    value = body.value;
    if (value === 1) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(value, 1);
});

test("get_history returns samples for a continuous-value state", async () => {
  const result = await mcpClient.callTool({ name: "get_history", arguments: { uuid: "state-living-climate-temp" } });
  const samples = JSON.parse((result.content as Array<{ text: string }>)[0].text);
  assert.ok(Array.isArray(samples) && samples.length > 2000);
});

test("get_history errors for a state with no history", async () => {
  const result = await mcpClient.callTool({ name: "get_history", arguments: { uuid: "state-master-light-active" } });
  assert.equal(result.isError, true);
});
