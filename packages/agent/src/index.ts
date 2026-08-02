import { createInterface } from "node:readline/promises";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { toAnthropicTools } from "./anthropicTools.js";
import { connectToMcpServer } from "./mcpClient.js";

const SYSTEM_PROMPT = `You are Heron, a natural-language interface for a home automation system.
You have no way to affect the house except by calling the tools you've been given —
those tools are the entire, whitelisted surface of what you may do. Never claim to have
taken an action you didn't call a tool for, and never guess device state; call a
discovery/monitoring tool instead. If no tool can answer a question, say so plainly.`;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const anthropic = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

  console.log("Connecting to the Heron MCP server...");
  const mcp = await connectToMcpServer();
  const { tools: mcpTools } = await mcp.listTools();
  const tools = toAnthropicTools(mcpTools);
  console.log(`Connected. Available tools: ${mcpTools.map((t) => t.name).join(", ")}`);

  const messages: MessageParam[] = [];
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log('Heron agent ready. Type a message, or "exit" to quit.');
  while (true) {
    const input = await rl.question("> ");
    if (input.trim() === "exit" || input.trim() === "quit") break;

    messages.push({ role: "user", content: input });

    // Tool-use loop: keep calling Claude and executing any requested MCP
    // tools until it responds with plain text instead of a tool call.
    while (true) {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
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
        console.log(`  [calling ${toolUse.name}]`);
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
