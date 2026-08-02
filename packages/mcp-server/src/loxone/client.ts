import WebSocket from "ws";
import { acquireToken, killToken, type LoxoneToken } from "./auth.js";
import { parseStructure } from "./parseStructure.js";
import type { LoxoneClientOptions, LoxoneHistorySample, LoxoneScene, LoxoneStructure } from "./types.js";

const DEFAULT_STRUCTURE_CACHE_MS = 60_000;

export class LoxoneClient {
  private readonly baseUrl: string;
  private readonly user: string;
  private readonly password: string;
  private readonly clientId: string;
  private readonly clientName: string;
  private readonly structureCacheMs: number;

  private token: LoxoneToken | undefined;
  private structure: LoxoneStructure | undefined;
  private structureFetchedAt = 0;

  // In-flight promises, so concurrent calls (e.g. discovery tools fired via
  // Promise.all) share one auth handshake / structure fetch instead of
  // racing each other against the Miniserver.
  private authPromise: Promise<void> | undefined;
  private structurePromise: Promise<LoxoneStructure> | undefined;

  // Monitoring tier: one long-lived WebSocket, kept in sync with the
  // Miniserver's live state so get_state reads are instant (no round-trip)
  // instead of opening a connection per query.
  private ws: WebSocket | undefined;
  private wsReadyPromise: Promise<void> | undefined;
  private readonly liveStates = new Map<string, number | string>();

  constructor(options: LoxoneClientOptions) {
    this.baseUrl = `http://${options.host}`;
    this.user = options.user;
    this.password = options.password;
    this.clientId = options.clientId ?? "heron-mcp-server";
    this.clientName = options.clientName ?? "Heron MCP Server";
    this.structureCacheMs = options.structureCacheMs ?? DEFAULT_STRUCTURE_CACHE_MS;
  }

  async authenticate(): Promise<void> {
    this.token = await acquireToken(this.baseUrl, this.user, this.password, this.clientId, this.clientName);
  }

  private async ensureAuthenticated(): Promise<void> {
    // validUntil is Unix seconds; treat a token expiring within 5s as already
    // expired to avoid racing the Miniserver's own clock.
    const isExpired = this.token !== undefined && Date.now() >= this.token.validUntil * 1000 - 5_000;
    if (this.token && !isExpired) return;
    if (isExpired) this.token = undefined;
    this.authPromise ??= this.authenticate().finally(() => {
      this.authPromise = undefined;
    });
    await this.authPromise;
  }

  /**
   * Wraps an authenticated Loxone HTTP call with one retry: if the
   * Miniserver rejects the (proactively-refreshed) token with a 401 anyway —
   * e.g. it was killed/rotated server-side — clear it, re-authenticate once,
   * and redo the request with the new token.
   */
  private authHeader(): Record<string, string> {
    return { Authorization: `Bearer ${this.token?.token}` };
  }

  private async authenticatedFetch(url: string | URL): Promise<Response> {
    await this.ensureAuthenticated();
    let res = await fetch(url, { headers: this.authHeader() });
    if (res.status === 401) {
      this.token = undefined;
      await this.ensureAuthenticated();
      res = await fetch(url, { headers: this.authHeader() });
    }
    return res;
  }

  async close(): Promise<void> {
    this.ws?.close();
    this.ws = undefined;
    if (this.token) {
      await killToken(this.baseUrl, this.token.token, this.user);
      this.token = undefined;
    }
  }

  async getStructure(): Promise<LoxoneStructure> {
    const isStale = Date.now() - this.structureFetchedAt > this.structureCacheMs;
    if (this.structure && !isStale) {
      return this.structure;
    }
    this.structurePromise ??= this.fetchStructure()
      .then((structure) => {
        this.structure = structure;
        this.structureFetchedAt = Date.now();
        return structure;
      })
      .finally(() => {
        this.structurePromise = undefined;
      });
    return this.structurePromise;
  }

  /**
   * Lists named scenes. This is a Heron-mock-only extension of the protocol
   * (see packages/loxone-mock's README) — real Miniservers have no generic
   * scene concept in the structure file.
   */
  async listScenes(): Promise<LoxoneScene[]> {
    const res = await this.authenticatedFetch(`${this.baseUrl}/jdev/sps/scenes`);
    if (!res.ok) {
      throw new Error(`Failed to list Loxone scenes (${res.status})`);
    }
    const body = (await res.json()) as { LL: { value: LoxoneScene[] } };
    return body.LL.value;
  }

  /**
   * Reads a single state's current live value. Opens (and reuses) one
   * long-lived WebSocket to the Miniserver, seeded by its initial-sync
   * batch on connect (see packages/loxone-mock's README for the mock's
   * version of this) and kept current by subsequent push updates.
   */
  async getLiveState(stateUuid: string): Promise<number | string | undefined> {
    await this.ensureLiveConnection();
    return this.liveStates.get(stateUuid);
  }

  /**
   * Historical samples for a state, if available. This is a Heron-mock-only
   * extension of the protocol (see packages/loxone-mock's README) — real
   * Miniservers expose statistics as monthly binary files over FTP, not an
   * HTTP/JSON API.
   */
  async getHistory(stateUuid: string, from?: number, to?: number): Promise<LoxoneHistorySample[] | undefined> {
    const url = new URL(`${this.baseUrl}/jdev/sps/history/${encodeURIComponent(stateUuid)}`);
    if (from !== undefined) url.searchParams.set("from", String(from));
    if (to !== undefined) url.searchParams.set("to", String(to));
    const res = await this.authenticatedFetch(url);
    if (res.status === 404) return undefined;
    if (!res.ok) {
      throw new Error(`Failed to get Loxone history (${res.status})`);
    }
    const body = (await res.json()) as { LL: { value: LoxoneHistorySample[] } };
    return body.LL.value;
  }

  /**
   * Sends a command to a control, mutating real device state. This is the
   * action tier — the caller (an MCP tool handler) must only invoke this
   * after whatever confirmation-flow the agent enforces; the client itself
   * does not gate this call.
   */
  async sendCommand(controlUuid: string, command: string): Promise<string> {
    const res = await this.authenticatedFetch(
      `${this.baseUrl}/jdev/sps/io/${encodeURIComponent(controlUuid)}/${encodeURIComponent(command)}`,
    );
    if (res.status === 404) {
      throw new Error(`Unknown control: ${controlUuid}`);
    }
    if (!res.ok) {
      throw new Error(`Failed to send Loxone command (${res.status})`);
    }
    const body = (await res.json()) as { LL: { value: string } };
    return body.LL.value;
  }

  /**
   * Activates a named scene (see listScenes — a Heron-mock-only extension),
   * applying its whole bundle of state writes at once. Action tier, same
   * caveat as sendCommand.
   */
  async activateScene(sceneId: string): Promise<{ sceneId: string; actionsApplied: number }> {
    const res = await this.authenticatedFetch(`${this.baseUrl}/jdev/sps/scene/${encodeURIComponent(sceneId)}`);
    if (res.status === 404) {
      throw new Error(`Unknown scene: ${sceneId}`);
    }
    if (!res.ok) {
      throw new Error(`Failed to activate Loxone scene (${res.status})`);
    }
    const body = (await res.json()) as { LL: { value: { sceneId: string; actionsApplied: number } } };
    return body.LL.value;
  }

  private async ensureLiveConnection(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    await this.ensureAuthenticated();
    this.wsReadyPromise ??= new Promise<void>((resolve, reject) => {
      const wsUrl = `${this.baseUrl.replace(/^http/, "ws")}/ws/rfc6455?token=${this.token?.token}`;
      const ws = new WebSocket(wsUrl);
      ws.on("message", (data) => {
        const message = JSON.parse(data.toString()) as { type?: string; uuid?: string; value?: number | string };
        if (message.type === "ready") {
          resolve();
          return;
        }
        if (message.uuid !== undefined && message.value !== undefined) {
          this.liveStates.set(message.uuid, message.value);
        }
      });
      ws.on("error", reject);
      this.ws = ws;
    }).finally(() => {
      this.wsReadyPromise = undefined;
    });
    await this.wsReadyPromise;
  }

  private async fetchStructure(): Promise<LoxoneStructure> {
    const res = await this.authenticatedFetch(`${this.baseUrl}/data/LoxAPP3.json`);
    if (!res.ok) {
      throw new Error(`Failed to fetch Loxone structure file (${res.status})`);
    }
    return parseStructure(await res.json());
  }
}
