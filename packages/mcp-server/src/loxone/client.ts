import { acquireToken, killToken, type LoxoneToken } from "./auth.js";
import { parseStructure } from "./parseStructure.js";
import type { LoxoneClientOptions, LoxoneScene, LoxoneStructure } from "./types.js";

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
    if (this.token) return;
    this.authPromise ??= this.authenticate().finally(() => {
      this.authPromise = undefined;
    });
    await this.authPromise;
  }

  async close(): Promise<void> {
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
    await this.ensureAuthenticated();
    const res = await fetch(`${this.baseUrl}/jdev/sps/scenes`, {
      headers: { Authorization: `Bearer ${this.token?.token}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to list Loxone scenes (${res.status})`);
    }
    const body = (await res.json()) as { LL: { value: LoxoneScene[] } };
    return body.LL.value;
  }

  private async fetchStructure(): Promise<LoxoneStructure> {
    await this.ensureAuthenticated();
    const res = await fetch(`${this.baseUrl}/data/LoxAPP3.json`, {
      headers: { Authorization: `Bearer ${this.token?.token}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch Loxone structure file (${res.status})`);
    }
    return parseStructure(await res.json());
  }
}
