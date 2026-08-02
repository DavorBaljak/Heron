import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LoxoneClient } from "./loxone/client.js";
import { registerActionTools } from "./tools/action/index.js";
import { registerDiscoveryTools } from "./tools/discovery/index.js";
import { registerMonitoringTools } from "./tools/monitoring/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.resolve(here, "../../../.env"));
} catch {
  // No repo-root .env — fall back to whatever's already in the environment.
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const client = new LoxoneClient({
  host: requireEnv("LOXONE_HOST"),
  user: requireEnv("LOXONE_USER"),
  password: requireEnv("LOXONE_PASSWORD"),
});

const server = new McpServer({
  name: "heron-mcp-server",
  version: "0.0.1",
});

registerDiscoveryTools(server, client);
registerMonitoringTools(server, client);
registerActionTools(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
