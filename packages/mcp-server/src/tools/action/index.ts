import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LoxoneClient } from "../../loxone/client.js";
import { errorResult, jsonResult } from "../jsonResult.js";

/**
 * Action tier: these tools perform real writes against the house. The
 * `annotations` below are MCP hints only — per the SDK's own docs, a client
 * must never base a security decision on server-declared annotations (a
 * server could always lie). The actual confirmation gate lives in the
 * agent's own hardcoded tool-name allowlist (see packages/agent/src/index.ts),
 * not here.
 */
export function registerActionTools(server: McpServer, client: LoxoneClient): void {
  server.registerTool(
    "set_control_state",
    {
      title: "Send a command to a control",
      description:
        "Send a command to a control (device), changing real state — e.g. \"on\"/\"off\" for a switch, a numeric position for a blind, a numeric target temperature. This performs a real write against the house.",
      inputSchema: {
        uuid: z.string().describe("Control UUID"),
        command: z.string().describe('Command: "on", "off", or a numeric value depending on control type'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ uuid, command }) => {
      const structure = await client.getStructure();
      if (!structure.controls[uuid]) {
        return errorResult(`No control found with uuid ${uuid}`);
      }
      try {
        const result = await client.sendCommand(uuid, command);
        return jsonResult({ uuid, command, result });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "activate_scene",
    {
      title: "Activate a scene",
      description:
        "Activate a named scene (from list_scenes), applying its whole bundle of state writes at once — e.g. Good Morning, Away, Severe Weather. This performs real writes against the house.",
      inputSchema: {
        id: z.string().describe("Scene id, from list_scenes"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ id }) => {
      try {
        const result = await client.activateScene(id);
        return jsonResult(result);
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  );
}
