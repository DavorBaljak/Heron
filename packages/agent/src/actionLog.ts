import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export interface ActionLogEntry {
  timestamp: string;
  tool: string;
  arguments: unknown;
  confirmed: boolean;
  error?: string;
}

/** Every executed (and declined) action-tier call is appended here — see
 * ARCHITECTURE.md #4: "svaka izvršena akcija se loguje s vremenskom oznakom". */
export async function appendActionLog(filePath: string, entry: ActionLogEntry): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}
