import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * The pairing token is the gateway's minimal defense-in-depth against
 * anything else on the home WiFi connecting — the network being closed is
 * the primary boundary, this is a second check, not a replacement for it.
 * Generated once and persisted (0600) rather than requiring the user to
 * invent and type one.
 */
export async function ensurePairingToken(filePath: string): Promise<string> {
  try {
    const existing = (await readFile(filePath, "utf8")).trim();
    if (existing) return existing;
  } catch {
    // No token file yet — generate one below.
  }

  const token = randomBytes(24).toString("hex");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, token, { encoding: "utf8", mode: 0o600 });
  return token;
}
