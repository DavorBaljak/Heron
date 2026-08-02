import { createServer, type Server } from "node:http";
import { WebSocketServer } from "ws";
import { AuthManager, type MockCredentials } from "./auth.js";
import { fixtureScenes, fixtureStateValues, fixtureStructure } from "./fixture.js";
import { getHistory, hasHistory } from "./history.js";
import { StateStore, type StateUpdate } from "./state.js";

export interface MockLoxoneOptions {
  credentials?: MockCredentials;
}

const DEFAULT_CREDENTIALS: MockCredentials = { user: "test", password: "test" };

/**
 * Mock of the Loxone Miniserver Web API, for testing an MCP server without
 * real hardware.
 *
 * Faithful to the documented protocol: getkey2/gettoken really validate the
 * HMAC-SHA1(key, user:sha1(password:salt)) handshake against a configured
 * user/password (a wrong password is genuinely rejected, not just accepted),
 * tokens are checked on every protected endpoint, and `/jdev/sps/io/{uuid}/{command}`
 * mutates real in-memory device state.
 *
 * Known simplification: real Loxone WebSocket push uses a proprietary binary
 * message-header framing that isn't fully documented publicly. This mock
 * instead pushes plain JSON text frames on `/ws/rfc6455` (`{ uuid, value }`
 * per state change) — enough to exercise a client's subscribe/handle-update
 * logic, but not a byte-for-byte replica of the real wire format.
 *
 * Mock-only extension (not a real Loxone endpoint): `/jdev/sps/scenes` lists
 * named scenes, and `/jdev/sps/scene/{id}` activates one, applying its whole
 * set of state writes at once. Real Loxone has no generic "scene" concept in
 * the structure file — scenes are normally built from virtual inputs/program
 * blocks in Loxone Config. This exists purely so scene-style multi-device
 * actions can be exercised in tests.
 *
 * Mock-only extension (not a real Loxone endpoint): `/jdev/sps/history/{stateUuid}`
 * returns ~90 days of synthetic historical samples for a handful of
 * continuous-value states (temperatures, solar production, energy meter).
 * Real Loxone stores statistics as monthly binary files retrieved over FTP,
 * not a documented HTTP/JSON API — this is a deliberately simpler stand-in
 * for testing history-consuming code, not a faithful protocol replica.
 */
export function createMockLoxoneServer(options: MockLoxoneOptions = {}): Server {
  const auth = new AuthManager(options.credentials ?? DEFAULT_CREDENTIALS);
  const state = new StateStore();
  state.init(fixtureStateValues);

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://mock");
    const segments = url.pathname.split("/");

    const send = (value: unknown, code: string | number = 200) => {
      res.writeHead(Number(code), { "Content-Type": "application/json" });
      res.end(JSON.stringify({ LL: { control: url.pathname, code, value } }));
    };
    const unauthorized = () => {
      res.writeHead(401);
      res.end();
    };
    const bearerToken = () => {
      const header = req.headers.authorization;
      return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    };

    if (url.pathname.startsWith("/jdev/sys/getkey2/")) {
      const user = decodeURIComponent(segments[4] ?? "");
      send(auth.getKey2(user));
      return;
    }

    if (url.pathname.startsWith("/jdev/sys/gettoken/")) {
      const [, , , , hash, rawUser] = segments;
      const result = auth.verifyAndIssueToken(decodeURIComponent(rawUser ?? ""), hash ?? "");
      if (!result) {
        send({ authenticated: false }, 401);
        return;
      }
      send({ token: result.token, key: "", validUntil: result.validUntil, tokenRights: 4, unsecurePass: false });
      return;
    }

    if (url.pathname.startsWith("/jdev/sys/killtoken/")) {
      auth.kill(segments[4] ?? "");
      send({});
      return;
    }

    if (url.pathname === "/data/LoxAPP3.json") {
      if (!auth.isValid(bearerToken())) {
        unauthorized();
        return;
      }
      // The structure file endpoint returns the raw structure JSON directly
      // (not wrapped in the {LL: {...}} envelope used by /jdev endpoints).
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(fixtureStructure));
      return;
    }

    if (url.pathname.startsWith("/jdev/sps/io/")) {
      if (!auth.isValid(bearerToken())) {
        unauthorized();
        return;
      }
      const uuid = segments[4];
      const command = decodeURIComponent(segments.slice(5).join("/"));
      const control = fixtureStructure.controls[uuid as keyof typeof fixtureStructure.controls] as
        | { states?: Record<string, string> }
        | undefined;
      if (!control) {
        res.writeHead(404);
        res.end();
        return;
      }
      const [stateKey] = Object.keys(control.states ?? {});
      const stateUuid = stateKey ? control.states?.[stateKey] : undefined;
      if (stateUuid) {
        const numeric = Number(command === "on" ? 1 : command === "off" ? 0 : command);
        state.set(stateUuid, Number.isNaN(numeric) ? command : numeric);
      }
      send(command);
      return;
    }

    if (url.pathname.startsWith("/jdev/sps/history/")) {
      if (!auth.isValid(bearerToken())) {
        unauthorized();
        return;
      }
      const stateUuid = decodeURIComponent(segments[4] ?? "");
      if (!hasHistory(stateUuid)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const from = url.searchParams.has("from") ? Number(url.searchParams.get("from")) * 1000 : undefined;
      const to = url.searchParams.has("to") ? Number(url.searchParams.get("to")) * 1000 : undefined;
      send(getHistory(stateUuid, from, to));
      return;
    }

    if (url.pathname === "/jdev/sps/scenes") {
      if (!auth.isValid(bearerToken())) {
        unauthorized();
        return;
      }
      const scenes = Object.entries(fixtureScenes).map(([id, scene]) => ({
        id,
        name: scene.name,
        description: scene.description,
      }));
      send(scenes);
      return;
    }

    if (url.pathname.startsWith("/jdev/sps/scene/")) {
      if (!auth.isValid(bearerToken())) {
        unauthorized();
        return;
      }
      const sceneId = decodeURIComponent(segments[4] ?? "");
      const scene = fixtureScenes[sceneId];
      if (!scene) {
        res.writeHead(404);
        res.end();
        return;
      }
      for (const action of scene.actions) {
        state.set(action.state, action.value);
      }
      send({ sceneId, actionsApplied: scene.actions.length });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://mock");
    if (url.pathname !== "/ws/rfc6455") {
      socket.destroy();
      return;
    }
    if (!auth.isValid(url.searchParams.get("token") ?? undefined)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });

  wss.on("connection", (ws) => {
    const onUpdate = (update: StateUpdate) => ws.send(JSON.stringify(update));
    state.on("update", onUpdate);
    ws.on("close", () => state.off("update", onUpdate));
    ws.on("message", (data) => {
      if (data.toString() === "keepalive") {
        ws.send("keepalive");
      }
    });
  });

  return server;
}
