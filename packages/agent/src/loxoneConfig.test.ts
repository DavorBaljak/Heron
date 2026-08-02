import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadLoxoneConfig, saveLoxoneConfig } from "./loxoneConfig.js";

let tmpDir: string;
after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

test("returns undefined when no config file exists", async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "heron-loxone-config-"));
  const filePath = path.join(tmpDir, "nested", "loxone-config.json");
  assert.equal(await loadLoxoneConfig(filePath), undefined);
});

test("save/load round-trips a config through disk with owner-only permissions", async () => {
  const filePath = path.join(tmpDir, "nested", "loxone-config.json");
  const config = { host: "192.168.1.50", user: "admin", password: "secret" };

  await saveLoxoneConfig(filePath, config);
  const loaded = await loadLoxoneConfig(filePath);
  assert.deepEqual(loaded, config);

  const stats = await stat(filePath);
  assert.equal(stats.mode & 0o777, 0o600);
});
