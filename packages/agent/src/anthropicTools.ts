import type Anthropic from "@anthropic-ai/sdk";

interface McpToolLike {
  name: string;
  description?: string;
  inputSchema: unknown;
}

export function toAnthropicTools(mcpTools: McpToolLike[]): Anthropic.Tool[] {
  return mcpTools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? "",
    input_schema: tool.inputSchema as Anthropic.Tool["input_schema"],
  }));
}
