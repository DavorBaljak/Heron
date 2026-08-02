import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { appendActionLog } from "./actionLog.js";

let tmpDir: string;
after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

test("appends JSONL entries, creating nested directories as needed", async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "heron-action-log-"));
  const filePath = path.join(tmpDir, "nested", "action-log.jsonl");

  await appendActionLog(filePath, {
    timestamp: "2026-08-02T00:00:00.000Z",
    tool: "set_control_state",
    arguments: { uuid: "ctrl-living-light", command: "on" },
    confirmed: true,
  });
  await appendActionLog(filePath, {
    timestamp: "2026-08-02T00:01:00.000Z",
    tool: "activate_scene",
    arguments: { id: "scene-away" },
    confirmed: false,
  });

  const lines = (await readFile(filePath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].tool, "set_control_state");
  assert.equal(lines[0].confirmed, true);
  assert.equal(lines[1].confirmed, false);
});
