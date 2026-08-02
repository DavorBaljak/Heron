import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LoxoneClient } from "../../loxone/client.js";
import { errorResult, jsonResult } from "../jsonResult.js";

export function registerDiscoveryTools(server: McpServer, client: LoxoneClient): void {
  server.registerTool(
    "list_rooms",
    {
      title: "List rooms",
      description: "List all rooms known to the Loxone structure file.",
      inputSchema: {},
    },
    async () => {
      const structure = await client.getStructure();
      return jsonResult(Object.values(structure.rooms));
    },
  );

  server.registerTool(
    "list_categories",
    {
      title: "List categories",
      description: "List all control categories (e.g. lighting, shading) known to the Loxone structure file.",
      inputSchema: {},
    },
    async () => {
      const structure = await client.getStructure();
      return jsonResult(Object.values(structure.cats));
    },
  );

  server.registerTool(
    "list_controls",
    {
      title: "List controls",
      description: "List controls (devices), optionally filtered by room or category UUID.",
      inputSchema: {
        room: z.string().optional().describe("Room UUID to filter by"),
        category: z.string().optional().describe("Category UUID to filter by"),
      },
    },
    async ({ room, category }) => {
      const structure = await client.getStructure();
      const controls = Object.values(structure.controls).filter(
        (control) => (!room || control.room === room) && (!category || control.cat === category),
      );
      return jsonResult(controls);
    },
  );

  server.registerTool(
    "get_control",
    {
      title: "Get control",
      description: "Get details for a single control (device) by UUID.",
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
      return jsonResult(control);
    },
  );

  server.registerTool(
    "list_scenes",
    {
      title: "List scenes",
      description: "List named scenes that can be activated as a single bundled action (e.g. Good Morning, Away, Severe Weather).",
      inputSchema: {},
    },
    async () => {
      const scenes = await client.listScenes();
      return jsonResult(scenes);
    },
  );
}
