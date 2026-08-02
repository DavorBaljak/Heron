import { createInterface } from "node:readline/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { toAnthropicTools } from "./anthropicTools.js";
import { fetchDiscoverySnapshot, loadDiscoveryCache, saveDiscoveryCache } from "./discoveryCache.js";
import { loadLoxoneConfig } from "./loxoneConfig.js";
import { connectToMcpServer } from "./mcpClient.js";
import { createSession } from "./session.js";

const here = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.resolve(here, "../../../.env"));
} catch {
  // No repo-root .env — fall back to whatever's already in the environment.
}

const DEFAULT_DISCOVERY_CACHE_PATH = path.resolve(here, "../data/discovery-cache.json");
const DEFAULT_ACTION_LOG_PATH = path.resolve(here, "../data/action-log.jsonl");
const DEFAULT_LOXONE_CONFIG_PATH = path.resolve(here, "../data/loxone-config.json");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * There's no reliable way to auto-discover a Loxone Miniserver on the local
 * network, so credentials come from LOXONE_HOST/USER/PASSWORD (.env/shell —
 * Docker's config keeps working unchanged) or a saved config file. Credential
 * *entry* deliberately does not happen here or anywhere in this file: it's a
 * separate script (setup.ts) with no import of @anthropic-ai/sdk anywhere in
 * its dependency graph, so typed credentials structurally cannot reach the
 * chat/LLM code path — not just "we call this before the LLM stuff" by
 * convention, but a fact checkable from the import graph.
 */
async function ensureLoxoneConnection(): Promise<void> {
  if (process.env.LOXONE_HOST && process.env.LOXONE_USER && process.env.LOXONE_PASSWORD) {
    return;
  }

  const configPath = process.env.HERON_LOXONE_CONFIG_PATH ?? DEFAULT_LOXONE_CONFIG_PATH;
  const cached = await loadLoxoneConfig(configPath);
  if (cached) {
    process.env.LOXONE_HOST = cached.host;
    process.env.LOXONE_USER = cached.user;
    process.env.LOXONE_PASSWORD = cached.password;
    console.log(`Using saved Loxone connection (${cached.host}) from ${configPath}.`);
    return;
  }

  throw new Error(
    "No Loxone connection configured. Run `npm run setup --workspace=@heron/agent` first " +
      "(a separate tool that never touches the chat/LLM code path), then start the agent again.",
  );
}

async function main() {
  await ensureLoxoneConnection();

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

  // Created only now, right before the interactive loop: readline starts
  // parsing stdin as soon as the Interface exists, even before .question()
  // is first called, so creating it earlier risks losing input typed during
  // the slow MCP-connect/discovery startup above (no listener is attached
  // to catch that first 'line' event yet).
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // rl.question() throws ERR_USE_AFTER_CLOSE once stdin hits EOF (e.g. piped
  // input, non-interactive runs) — treat that as a clean end of input.
  async function ask(prompt: string): Promise<string | undefined> {
    try {
      return await rl.question(prompt);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ERR_USE_AFTER_CLOSE") return undefined;
      throw error;
    }
  }

  console.log('Heron agent ready. Type a message, "refresh" to re-run discovery, or "exit" to quit.');
  while (true) {
    const input = await ask("> ");
    if (input === undefined) break;
    const trimmed = input.trim();
    if (trimmed === "exit" || trimmed === "quit") break;

    if (trimmed === "refresh") {
      console.log("Re-running discovery...");
      await session.refreshDiscovery();
      console.log(`Discovery refreshed — cached to ${cachePath}.`);
      continue;
    }

    const reply = await session.handleMessage(input, {
      onToolCall: (name) => console.log(`  [calling ${name}]`),
      confirmAction: async (name, args) => {
        console.log(`\nProposed action: ${name}(${JSON.stringify(args)})`);
        const answer = await ask("Confirm and execute this action? [y/N] ");
        return answer !== undefined && /^y(es)?$/i.test(answer.trim());
      },
    });
    console.log(reply);
  }

  rl.close();
  await mcp.close();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
