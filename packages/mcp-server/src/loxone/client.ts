import { acquireToken, killToken, type LoxoneToken } from "./auth.js";
import { parseStructure } from "./parseStructure.js";
import type { LoxoneClientOptions, LoxoneStructure } from "./types.js";

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

  async close(): Promise<void> {
    if (this.token) {
      await killToken(this.baseUrl, this.token.token, this.user);
      this.token = undefined;
    }
  }

  async getStructure(): Promise<LoxoneStructure> {
    const isStale = Date.now() - this.structureFetchedAt > this.structureCacheMs;
    if (!this.structure || isStale) {
      this.structure = await this.fetchStructure();
      this.structureFetchedAt = Date.now();
    }
    return this.structure;
  }

  private async fetchStructure(): Promise<LoxoneStructure> {
    if (!this.token) {
      await this.authenticate();
    }
    const res = await fetch(`${this.baseUrl}/data/LoxAPP3.json`, {
      headers: { Authorization: `Bearer ${this.token?.token}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch Loxone structure file (${res.status})`);
    }
    return parseStructure(await res.json());
  }
}
