import { loadLoxoneConfig } from "./loxoneConfig.js";

/**
 * There's no reliable way to auto-discover a Loxone Miniserver on the local
 * network, so credentials come from LOXONE_HOST/USER/PASSWORD (.env/shell —
 * Docker's config keeps working unchanged) or a saved config file. Credential
 * *entry* deliberately does not happen here: it's a separate script
 * (setup.ts) with no import of @anthropic-ai/sdk anywhere in its dependency
 * graph, so typed credentials structurally cannot reach the chat/LLM code
 * path — not just "we call this before the LLM stuff" by convention, but a
 * fact checkable from the import graph. Shared by both the CLI (index.ts)
 * and the gateway, since both need the same credential-resolution rules.
 */
export async function ensureLoxoneConnection(configPath: string): Promise<void> {
  if (process.env.LOXONE_HOST && process.env.LOXONE_USER && process.env.LOXONE_PASSWORD) {
    return;
  }

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
