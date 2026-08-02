import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LoxoneClient } from "./loxone/client.js";
import { registerDiscoveryTools } from "./tools/discovery/index.js";

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

const transport = new StdioServerTransport();
await server.connect(transport);
