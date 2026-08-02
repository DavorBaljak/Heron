import type { DashboardControl } from "./discovery.js";
import { callToolJson, type McpClientLike } from "./discovery.js";

export interface StateUpdate {
  uuid: string;
  key: string;
  value: number | string;
}

/** control uuid -> {state key -> live value} */
export type StateSnapshot = Map<string, Record<string, number | string>>;

interface ControlStateResult {
  uuid: string;
  name: string;
  states: Record<string, number | string | undefined>;
}

/**
 * Polls get_control_state for every control that has states, diffs against
 * the last known values, and reports only what changed. This is cheap:
 * LoxoneClient (mcp-server) already keeps live values in memory via its own
 * push WebSocket to the Miniserver — each poll here is just a local MCP
 * round-trip reading that in-memory state, not an extra Miniserver request.
 */
export async function startPolling(
  mcp: McpClientLike,
  controls: DashboardControl[],
  onUpdate: (update: StateUpdate) => void,
  intervalMs = 1500,
): Promise<{ snapshot: StateSnapshot; stop: () => void }> {
  const snapshot: StateSnapshot = new Map();
  const controlsWithStates = controls.filter((c) => c.states && Object.keys(c.states).length > 0);

  async function pollOnce() {
    for (const control of controlsWithStates) {
      let result: ControlStateResult;
      try {
        result = await callToolJson<ControlStateResult>(mcp, "get_control_state", { uuid: control.uuid });
      } catch {
        continue;
      }
      const known = snapshot.get(control.uuid) ?? {};
      for (const [key, value] of Object.entries(result.states)) {
        if (value === undefined) continue;
        if (known[key] === value) continue;
        known[key] = value;
        onUpdate({ uuid: control.uuid, key, value });
      }
      snapshot.set(control.uuid, known);
    }
  }

  // Await the first pass so callers get a populated snapshot immediately
  // (e.g. before the HTTP server starts accepting /api/snapshot requests).
  await pollOnce();

  let stopped = false;
  async function loop() {
    while (!stopped) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      if (!stopped) await pollOnce();
    }
  }
  void loop();

  return { snapshot, stop: () => { stopped = true; } };
}
