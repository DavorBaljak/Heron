import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

export interface DashboardRoom {
  uuid: string;
  name: string;
}

export interface DashboardCategory {
  uuid: string;
  name: string;
  type: string;
}

export interface DashboardControl {
  uuid: string;
  name: string;
  type: string;
  room?: string;
  cat?: string;
  states?: Record<string, string>;
}

export interface DashboardStructure {
  rooms: DashboardRoom[];
  categories: DashboardCategory[];
  controls: DashboardControl[];
}

export interface McpClientLike {
  callTool: Client["callTool"];
}

/**
 * Mirrors packages/agent/src/discoveryCache.ts's callToolJson/fetchDiscoverySnapshot,
 * but keeps each control's `states` map (list_controls returns it; the agent's
 * DiscoveryControl type just doesn't declare it, since chat doesn't need it) —
 * the dashboard needs those state UUIDs to poll live values per control.
 */
export async function callToolJson<T>(
  mcp: McpClientLike,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const result = await mcp.callTool({ name, arguments: args });
  const content = result.content as Array<{ type: string; text?: string }>;
  const text = content.find((block) => block.type === "text")?.text ?? "[]";
  return JSON.parse(text) as T;
}

export async function fetchStructure(mcp: McpClientLike): Promise<DashboardStructure> {
  const [rooms, categories, controls] = await Promise.all([
    callToolJson<DashboardRoom[]>(mcp, "list_rooms"),
    callToolJson<DashboardCategory[]>(mcp, "list_categories"),
    callToolJson<DashboardControl[]>(mcp, "list_controls"),
  ]);
  return { rooms, categories, controls };
}
