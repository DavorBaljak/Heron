import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureLoxoneConnection } from "@heron/agent/dist/loxoneConnection.js";
import { connectToMcpServer } from "@heron/agent/dist/mcpClient.js";
import { fetchStructure } from "./discovery.js";
import { startPolling, type StateUpdate } from "./poll.js";
import { createDashboardServer, type Snapshot } from "./server.js";

const here = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.resolve(here, "../../../.env"));
} catch {
  // No repo-root .env — fall back to whatever's already in the environment.
}

const DEFAULT_LOXONE_CONFIG_PATH = path.resolve(here, "../data/loxone-config.json");

async function main() {
  const loxoneConfigPath = process.env.HERON_LOXONE_CONFIG_PATH ?? DEFAULT_LOXONE_CONFIG_PATH;
  await ensureLoxoneConnection(loxoneConfigPath);

  console.log("Connecting to the Heron MCP server...");
  const mcp = await connectToMcpServer();
  console.log("Connected. Fetching house structure...");
  const structure = await fetchStructure(mcp);
  console.log(
    `Structure loaded: ${structure.rooms.length} rooms, ${structure.controls.length} controls.`,
  );

  const listeners = new Set<(update: StateUpdate) => void>();
  const broadcast = (update: StateUpdate) => {
    for (const listener of listeners) listener(update);
  };
  const subscribe = (listener: (update: StateUpdate) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  console.log("Polling live state...");
  const { snapshot } = await startPolling(mcp, structure.controls, broadcast);

  const getSnapshot = (): Snapshot => ({
    structure,
    states: Object.fromEntries(snapshot),
  });

  const port = Number(process.env.DASHBOARD_PORT ?? 8091);
  const server = createDashboardServer({ getSnapshot, subscribe });
  server.listen(port, () => {
    console.log(`Heron dashboard listening on http://0.0.0.0:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
