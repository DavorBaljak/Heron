import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MCP_SERVER_ENTRY = path.resolve(here, "../../mcp-server/src/index.ts");

/**
 * The agent's only connection to the house is this MCP client — it must
 * never open a network connection to the Loxone Miniserver itself (see
 * ARCHITECTURE.md #4). The MCP server is spawned as a child process and
 * talked to over stdio, exactly like any other MCP client.
 */
export async function connectToMcpServer(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", process.env.MCP_SERVER_ENTRY ?? DEFAULT_MCP_SERVER_ENTRY],
    env: Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)) as Record<
      string,
      string
    >,
  });
  const client = new Client({ name: "heron-agent", version: "0.0.1" });
  await client.connect(transport);
  return client;
}
