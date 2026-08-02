import type Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { appendActionLog } from "./actionLog.js";
import {
  type DiscoverySnapshot,
  fetchDiscoverySnapshot,
  formatDiscoverySummary,
  saveDiscoveryCache,
} from "./discoveryCache.js";

export const SYSTEM_PROMPT = `You are Heron, a natural-language interface for a home automation system.
You have no way to affect the house except by calling the tools you've been given —
those tools are the entire, whitelisted surface of what you may do. Never claim to have
taken an action you didn't call a tool for, and never guess device state; call a
discovery/monitoring tool instead. If no tool can answer a question, say so plainly.
Action-tier tools (set_control_state, activate_scene) perform real writes against the
house; the user will be asked to explicitly confirm each one before it runs, and may
decline — if they do, tell them plainly rather than assuming it happened.`;

// Confirmation gate for action-tier tools. This is a hardcoded allowlist the
// session itself controls — MCP tool "annotations" (destructiveHint etc.) are
// documented by the SDK as hints a client must never base a security
// decision on, since a server could always misreport them.
export const ACTION_TOOL_NAMES = new Set(["set_control_state", "activate_scene"]);

export interface SessionHooks {
  /**
   * Must return true to actually execute the action; false/reject declines
   * it. `description` is a natural-language summary (e.g. "Turn on Living
   * Room Light") built from the discovery snapshot — show that to the user,
   * not the raw tool name/JSON args, since the whole point of the agent is
   * to translate function calls into something a person actually reads.
   */
  confirmAction(description: string, toolName: string, args: unknown): Promise<boolean>;
  /** Optional feedback for non-action (read-only) tool calls. */
  onToolCall?(toolName: string): void;
}

/** Turns a raw action-tier tool call into a sentence a person can read/hear, via discovery lookups. */
function describeAction(toolName: string, args: unknown, discovery: DiscoverySnapshot): string {
  const params = (args ?? {}) as Record<string, unknown>;

  if (toolName === "set_control_state") {
    const uuid = String(params.uuid ?? "");
    const command = String(params.command ?? "");
    const name = discovery.controls.find((control) => control.uuid === uuid)?.name ?? uuid;
    if (command === "on") return `Turn on ${name}`;
    if (command === "off") return `Turn off ${name}`;
    return `Set ${name} to ${command}`;
  }

  if (toolName === "activate_scene") {
    const id = String(params.id ?? "");
    const name = discovery.scenes.find((scene) => scene.id === id)?.name ?? id;
    return `Activate the "${name}" scene`;
  }

  return `${toolName}(${JSON.stringify(args)})`;
}

export interface SessionOptions {
  anthropic: Anthropic;
  model: string;
  mcp: Client;
  tools: Anthropic.Tool[];
  discovery: DiscoverySnapshot;
  discoveryCachePath: string;
  actionLogPath: string;
}

export interface Session {
  /** Sends one user message through the full tool-use loop, returning Claude's final text reply. */
  handleMessage(text: string, hooks: SessionHooks): Promise<string>;
  refreshDiscovery(): Promise<DiscoverySnapshot>;
}

/**
 * The shared conversation engine behind both the CLI (index.ts) and the
 * gateway (packages/gateway) — each supplies its own SessionHooks for how
 * confirmation prompts and tool-call feedback reach the user.
 */
export function createSession(options: SessionOptions): Session {
  const { anthropic, model, mcp, tools, actionLogPath, discoveryCachePath } = options;
  let discovery = options.discovery;
  const messages: MessageParam[] = [];

  async function handleMessage(text: string, hooks: SessionHooks): Promise<string> {
    messages.push({ role: "user", content: text });

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
        return response.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");
      }

      const toolResults: ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        if (ACTION_TOOL_NAMES.has(toolUse.name)) {
          const description = describeAction(toolUse.name, toolUse.input, discovery);
          const approved = await hooks.confirmAction(description, toolUse.name, toolUse.input);
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
          hooks.onToolCall?.(toolUse.name);
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

  async function refreshDiscovery(): Promise<DiscoverySnapshot> {
    discovery = await fetchDiscoverySnapshot(mcp);
    await saveDiscoveryCache(discoveryCachePath, discovery);
    return discovery;
  }

  return { handleMessage, refreshDiscovery };
}
