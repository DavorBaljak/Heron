// Standalone Loxone connection setup — deliberately has zero dependency on
// @anthropic-ai/sdk or any LLM call. Credentials typed here never pass
// anywhere near the chat/LLM code path; that's a structural guarantee (check
// the imports below), not just a runtime ordering promise made in index.ts.
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { saveLoxoneConfig } from "./loxoneConfig.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LOXONE_CONFIG_PATH = path.resolve(here, "../data/loxone-config.json");

async function main() {
  const configPath = process.env.HERON_LOXONE_CONFIG_PATH ?? DEFAULT_LOXONE_CONFIG_PATH;
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log("Heron — Loxone connection setup.");
  console.log("This only talks to your Loxone Miniserver; nothing here is sent to any AI model.\n");

  const host = (await rl.question("Loxone Miniserver address (host or host:port): ")).trim();
  const user = (await rl.question("Loxone username: ")).trim();
  const password = await rl.question("Loxone password: ");
  rl.close();

  if (!host || !user || !password) {
    throw new Error("Setup was not completed — all three fields are required.");
  }

  await saveLoxoneConfig(configPath, { host, user, password });
  console.log(`\nSaved to ${configPath}. You can now run the agent (npm run dev --workspace=@heron/agent).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
