import assert from "node:assert/strict";
import { test } from "node:test";
import { toAnthropicTools } from "./anthropicTools.js";

test("converts MCP tool listings into Anthropic tool schema", () => {
  const mcpTools = [
    { name: "list_rooms", description: "List all rooms.", inputSchema: { type: "object", properties: {} } },
    { name: "get_control", inputSchema: { type: "object", properties: { uuid: { type: "string" } } } },
  ];

  const tools = toAnthropicTools(mcpTools);

  assert.equal(tools.length, 2);
  assert.equal(tools[0]?.name, "list_rooms");
  assert.equal(tools[0]?.description, "List all rooms.");
  assert.deepEqual(tools[0]?.input_schema, { type: "object", properties: {} });

  // Missing description falls back to an empty string rather than undefined,
  // since Anthropic's schema requires the field to be present.
  assert.equal(tools[1]?.description, "");
});
