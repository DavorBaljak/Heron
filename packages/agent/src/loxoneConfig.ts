import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface LoxoneConnectionConfig {
  host: string;
  user: string;
  password: string;
}

export async function loadLoxoneConfig(filePath: string): Promise<LoxoneConnectionConfig | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as LoxoneConnectionConfig;
  } catch {
    return undefined;
  }
}

/**
 * Saved with owner-only permissions since this holds a plaintext password —
 * still plaintext-on-disk, not encrypted, but at least not world-readable.
 */
export async function saveLoxoneConfig(filePath: string, config: LoxoneConnectionConfig): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(config, null, 2), { encoding: "utf8", mode: 0o600 });
}
