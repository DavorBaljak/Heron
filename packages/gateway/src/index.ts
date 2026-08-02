import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { toAnthropicTools } from "@heron/agent/dist/anthropicTools.js";
import { fetchDiscoverySnapshot, loadDiscoveryCache, saveDiscoveryCache } from "@heron/agent/dist/discoveryCache.js";
import { ensureLoxoneConnection } from "@heron/agent/dist/loxoneConnection.js";
import { connectToMcpServer } from "@heron/agent/dist/mcpClient.js";
import { createSession } from "@heron/agent/dist/session.js";
import { createGatewayServer } from "./server.js";
import { ensurePairingToken } from "./token.js";

const here = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.resolve(here, "../../../.env"));
} catch {
  // No repo-root .env — fall back to whatever's already in the environment.
}

const DEFAULT_DISCOVERY_CACHE_PATH = path.resolve(here, "../data/discovery-cache.json");
const DEFAULT_ACTION_LOG_PATH = path.resolve(here, "../data/action-log.jsonl");
const DEFAULT_LOXONE_CONFIG_PATH = path.resolve(here, "../data/loxone-config.json");
const DEFAULT_PAIRING_TOKEN_PATH = path.resolve(here, "../data/pairing-token.txt");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const loxoneConfigPath = process.env.HERON_LOXONE_CONFIG_PATH ?? DEFAULT_LOXONE_CONFIG_PATH;
  await ensureLoxoneConnection(loxoneConfigPath);

  const anthropic = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

  console.log("Connecting to the Heron MCP server...");
  const mcp = await connectToMcpServer();
  const { tools: mcpTools } = await mcp.listTools();
  const tools = toAnthropicTools(mcpTools);
  console.log(`Connected. Available tools: ${mcpTools.map((t) => t.name).join(", ")}`);

  const cachePath = process.env.HERON_DISCOVERY_CACHE_PATH ?? DEFAULT_DISCOVERY_CACHE_PATH;
  let discovery = await loadDiscoveryCache(cachePath);
  if (discovery) {
    console.log(`Loaded cached house structure from ${cachePath} (fetched ${discovery.fetchedAt}).`);
  } else {
    console.log("No cached house structure found — running discovery once...");
    discovery = await fetchDiscoverySnapshot(mcp);
    await saveDiscoveryCache(cachePath, discovery);
    console.log(`Discovery complete — cached to ${cachePath}.`);
  }
  const actionLogPath = process.env.HERON_ACTION_LOG_PATH ?? DEFAULT_ACTION_LOG_PATH;

  const session = createSession({ anthropic, model, mcp, tools, discovery, discoveryCachePath: cachePath, actionLogPath });

  const tokenPath = process.env.HERON_PAIRING_TOKEN_PATH ?? DEFAULT_PAIRING_TOKEN_PATH;
  const token = await ensurePairingToken(tokenPath);
  console.log(`Pairing token (enter this once in the Android app): ${token}`);
  console.log(`(also saved to ${tokenPath})`);

  const port = Number(process.env.GATEWAY_PORT ?? 8090);
  const server = createGatewayServer({ session, token });
  server.listen(port, () => {
    console.log(`Heron gateway listening on ws://0.0.0.0:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
