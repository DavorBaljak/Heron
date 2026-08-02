import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LoxoneClient } from "../../loxone/client.js";
import { errorResult, jsonResult } from "../jsonResult.js";

export function registerMonitoringTools(server: McpServer, client: LoxoneClient): void {
  server.registerTool(
    "get_state",
    {
      title: "Get live state value",
      description:
        "Get the current live value of a single state UUID (state UUIDs come from a control's `states` map, as returned by list_controls/get_control).",
      inputSchema: {
        uuid: z.string().describe("State UUID"),
      },
    },
    async ({ uuid }) => {
      const value = await client.getLiveState(uuid);
      if (value === undefined) {
        return errorResult(`No known live value for state ${uuid}`);
      }
      return jsonResult({ uuid, value });
    },
  );

  server.registerTool(
    "get_control_state",
    {
      title: "Get a control's live state",
      description: "Get current live values for all of a control's states at once, by control UUID.",
      inputSchema: {
        uuid: z.string().describe("Control UUID"),
      },
    },
    async ({ uuid }) => {
      const structure = await client.getStructure();
      const control = structure.controls[uuid];
      if (!control) {
        return errorResult(`No control found with uuid ${uuid}`);
      }
      const states: Record<string, number | string | undefined> = {};
      for (const [key, stateUuid] of Object.entries(control.states ?? {})) {
        states[key] = await client.getLiveState(stateUuid);
      }
      return jsonResult({ uuid, name: control.name, states });
    },
  );

  server.registerTool(
    "get_history",
    {
      title: "Get state history",
      description:
        "Get historical samples for a state over time, if available (only a subset of continuous-value states have history). `from`/`to` are optional Unix timestamps in seconds.",
      inputSchema: {
        uuid: z.string().describe("State UUID"),
        from: z.number().optional().describe("Unix timestamp (seconds), inclusive lower bound"),
        to: z.number().optional().describe("Unix timestamp (seconds), inclusive upper bound"),
      },
    },
    async ({ uuid, from, to }) => {
      const samples = await client.getHistory(uuid, from, to);
      if (!samples) {
        return errorResult(`No history available for state ${uuid}`);
      }
      return jsonResult(samples);
    },
  );
}
