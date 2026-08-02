import { createInterface } from "node:readline/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { appendActionLog } from "./actionLog.js";
import { toAnthropicTools } from "./anthropicTools.js";
import {
  fetchDiscoverySnapshot,
  formatDiscoverySummary,
  loadDiscoveryCache,
  saveDiscoveryCache,
} from "./discoveryCache.js";
import { loadLoxoneConfig } from "./loxoneConfig.js";
import { connectToMcpServer } from "./mcpClient.js";

const here = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.resolve(here, "../../../.env"));
} catch {
  // No repo-root .env — fall back to whatever's already in the environment.
}

const SYSTEM_PROMPT = `You are Heron, a natural-language interface for a home automation system.
You have no way to affect the house except by calling the tools you've been given —
those tools are the entire, whitelisted surface of what you may do. Never claim to have
taken an action you didn't call a tool for, and never guess device state; call a
discovery/monitoring tool instead. If no tool can answer a question, say so plainly.
Action-tier tools (set_control_state, activate_scene) perform real writes against the
house; the user will be asked to explicitly confirm each one before it runs, and may
decline — if they do, tell them plainly rather than assuming it happened.`;

const DEFAULT_DISCOVERY_CACHE_PATH = path.resolve(here, "../data/discovery-cache.json");
const DEFAULT_ACTION_LOG_PATH = path.resolve(here, "../data/action-log.jsonl");
const DEFAULT_LOXONE_CONFIG_PATH = path.resolve(here, "../data/loxone-config.json");

// Confirmation gate for action-tier tools. This is a hardcoded allowlist the
// agent itself controls — MCP tool "annotations" (destructiveHint etc.) are
// documented by the SDK as hints a client must never base a security
// decision on, since a server could always misreport them.
const ACTION_TOOL_NAMES = new Set(["set_control_state", "activate_scene"]);

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

  const messages: MessageParam[] = [];

  console.log('Heron agent ready. Type a message, "refresh" to re-run discovery, or "exit" to quit.');
  while (true) {
    const input = await ask("> ");
    if (input === undefined) break;
    const trimmed = input.trim();
    if (trimmed === "exit" || trimmed === "quit") break;

    if (trimmed === "refresh") {
      console.log("Re-running discovery...");
      discovery = await fetchDiscoverySnapshot(mcp);
      await saveDiscoveryCache(cachePath, discovery);
      console.log(`Discovery refreshed — cached to ${cachePath}.`);
      continue;
    }

    messages.push({ role: "user", content: input });

    // Tool-use loop: keep calling Claude and executing any requested MCP
    // tools until it responds with plain text instead of a tool call.
    while (true) {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        system: `${SYSTEM_PROMPT}\n\n${formatDiscoverySummary(discovery)}`,
        messages,
        tools,
      });
      messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter((block) => block.type === "tool_use");
      if (toolUses.length === 0) {
        const text = response.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");
        console.log(text);
        break;
      }

      const toolResults: ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        if (ACTION_TOOL_NAMES.has(toolUse.name)) {
          console.log(`\nProposed action: ${toolUse.name}(${JSON.stringify(toolUse.input)})`);
          const answer = await ask("Confirm and execute this action? [y/N] ");
          const approved = answer !== undefined && /^y(es)?$/i.test(answer.trim());
          await appendActionLog(actionLogPath, {
            timestamp: new Date().toISOString(),
            tool: toolUse.name,
            arguments: toolUse.input,
            confirmed: approved,
          });
          if (!approved) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: "The user declined to confirm this action; it was not executed.",
              is_error: true,
            });
            continue;
          }
        } else {
          console.log(`  [calling ${toolUse.name}]`);
        }

        const result = await mcp.callTool({ name: toolUse.name, arguments: toolUse.input as Record<string, unknown> });
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result.content as ToolResultBlockParam["content"],
          is_error: result.isError === true,
        });
      }
      messages.push({ role: "user", content: toolResults });
    }
  }

  rl.close();
  await mcp.close();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
