import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

export interface DiscoveryRoom {
  uuid: string;
  name: string;
}

export interface DiscoveryCategory {
  uuid: string;
  name: string;
  type: string;
}

export interface DiscoveryControl {
  uuid: string;
  name: string;
  type: string;
  room?: string;
  cat?: string;
}

export interface DiscoveryScene {
  id: string;
  name: string;
  description: string;
}

export interface DiscoverySnapshot {
  fetchedAt: string;
  rooms: DiscoveryRoom[];
  categories: DiscoveryCategory[];
  controls: DiscoveryControl[];
  scenes: DiscoveryScene[];
}

interface McpClientLike {
  callTool: Client["callTool"];
}

async function callToolJson<T>(mcp: McpClientLike, name: string): Promise<T> {
  const result = await mcp.callTool({ name, arguments: {} });
  const content = result.content as Array<{ type: string; text?: string }>;
  const text = content.find((block) => block.type === "text")?.text ?? "[]";
  return JSON.parse(text) as T;
}

/** Runs the full discovery tier once, rather than relying on Claude to call
 * these tools ad hoc for every question about the house's structure. */
export async function fetchDiscoverySnapshot(mcp: McpClientLike): Promise<DiscoverySnapshot> {
  const [rooms, categories, controls, scenes] = await Promise.all([
    callToolJson<DiscoveryRoom[]>(mcp, "list_rooms"),
    callToolJson<DiscoveryCategory[]>(mcp, "list_categories"),
    callToolJson<DiscoveryControl[]>(mcp, "list_controls"),
    callToolJson<DiscoveryScene[]>(mcp, "list_scenes"),
  ]);
  return { fetchedAt: new Date().toISOString(), rooms, categories, controls, scenes };
}

export async function loadDiscoveryCache(filePath: string): Promise<DiscoverySnapshot | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as DiscoverySnapshot;
  } catch {
    return undefined;
  }
}

/** Persisted to disk (not just held in memory) so the agent doesn't have to
 * re-run discovery on every restart. */
export async function saveDiscoveryCache(filePath: string, snapshot: DiscoverySnapshot): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(snapshot, null, 2), "utf8");
}

export function formatDiscoverySummary(snapshot: DiscoverySnapshot): string {
  const roomNameByUuid = new Map(snapshot.rooms.map((room) => [room.uuid, room.name]));

  const roomLines = snapshot.rooms.map((room) => `- ${room.name} (${room.uuid})`).join("\n");
  const controlLines = snapshot.controls
    .map((control) => `- ${control.name} [${control.type}] (${control.uuid}) — room: ${roomNameByUuid.get(control.room ?? "") ?? "unknown"}`)
    .join("\n");
  const sceneLines = snapshot.scenes.map((scene) => `- ${scene.name} (${scene.id}): ${scene.description}`).join("\n");

  return [
    `Known house structure (cached at ${snapshot.fetchedAt}). Use this instead of calling discovery tools again for basic lookups.`,
    "",
    "Rooms:",
    roomLines,
    "",
    "Controls:",
    controlLines,
    "",
    "Scenes:",
    sceneLines,
  ].join("\n");
}
