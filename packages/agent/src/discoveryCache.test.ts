import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import {
  fetchDiscoverySnapshot,
  formatDiscoverySummary,
  loadDiscoveryCache,
  saveDiscoveryCache,
} from "./discoveryCache.js";

const fixtures: Record<string, unknown> = {
  list_rooms: [{ uuid: "room-living", name: "Living Room" }],
  list_categories: [{ uuid: "cat-lighting", name: "Lighting", type: "lights" }],
  list_controls: [{ uuid: "ctrl-living-light", name: "Living Room Light", type: "Dimmer", room: "room-living", cat: "cat-lighting" }],
  list_scenes: [{ id: "scene-good-morning", name: "Good Morning", description: "Opens blinds." }],
};

const fakeMcp = {
  callTool: async ({ name }: { name: string }) => ({
    content: [{ type: "text", text: JSON.stringify(fixtures[name]) }],
  }),
} as any;

let tmpDir: string;
after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

test("fetchDiscoverySnapshot calls all four discovery tools and assembles a snapshot", async () => {
  const snapshot = await fetchDiscoverySnapshot(fakeMcp);
  assert.equal(snapshot.rooms.length, 1);
  assert.equal(snapshot.controls[0]?.name, "Living Room Light");
  assert.equal(snapshot.scenes[0]?.id, "scene-good-morning");
  assert.ok(snapshot.fetchedAt);
});

test("save/load round-trips a snapshot through disk", async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "heron-discovery-"));
  const filePath = path.join(tmpDir, "nested", "discovery-cache.json");

  assert.equal(await loadDiscoveryCache(filePath), undefined);

  const snapshot = await fetchDiscoverySnapshot(fakeMcp);
  await saveDiscoveryCache(filePath, snapshot);

  const loaded = await loadDiscoveryCache(filePath);
  assert.deepEqual(loaded, snapshot);
});

test("formatDiscoverySummary includes room, control, and scene names", () => {
  const summary = formatDiscoverySummary({
    fetchedAt: "2026-08-02T00:00:00.000Z",
    rooms: [{ uuid: "room-living", name: "Living Room" }],
    categories: [],
    controls: [{ uuid: "ctrl-living-light", name: "Living Room Light", type: "Dimmer", room: "room-living" }],
    scenes: [{ id: "scene-good-morning", name: "Good Morning", description: "Opens blinds." }],
  });

  assert.match(summary, /Living Room \(room-living\)/);
  assert.match(summary, /Living Room Light \[Dimmer\].*room: Living Room/);
  assert.match(summary, /Good Morning \(scene-good-morning\): Opens blinds\./);
});
