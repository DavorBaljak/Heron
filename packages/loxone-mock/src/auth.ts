import { createHash, createHmac, randomBytes } from "node:crypto";

export interface MockCredentials {
  user: string;
  password: string;
}

interface PendingHandshake {
  key: string;
  salt: string;
}

interface TokenRecord {
  user: string;
  expiresAt: number;
}

const TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Implements the real getkey2/gettoken HMAC handshake server-side, validating
 * against a single configured user/password pair — unlike a stub that accepts
 * any hash, a wrong password here is genuinely rejected.
 */
export class AuthManager {
  private readonly credentials: MockCredentials;
  private readonly pending = new Map<string, PendingHandshake>();
  private readonly tokens = new Map<string, TokenRecord>();

  constructor(credentials: MockCredentials) {
    this.credentials = credentials;
  }

  getKey2(user: string): PendingHandshake {
    const handshake: PendingHandshake = {
      key: randomBytes(16).toString("hex"),
      salt: randomBytes(8).toString("hex"),
    };
    this.pending.set(user, handshake);
    return handshake;
  }

  verifyAndIssueToken(user: string, hash: string): { token: string; validUntil: number } | undefined {
    const handshake = this.pending.get(user);
    if (!handshake || user !== this.credentials.user) {
      return undefined;
    }
    this.pending.delete(user);

    const pwHash = createHash("sha1")
      .update(`${this.credentials.password}:${handshake.salt}`)
      .digest("hex")
      .toUpperCase();
    const expected = createHmac("sha1", Buffer.from(handshake.key, "hex"))
      .update(`${user}:${pwHash}`)
      .digest("hex");

    if (expected !== hash) {
      return undefined;
    }

    const token = randomBytes(16).toString("hex");
    this.tokens.set(token, { user, expiresAt: Date.now() + TOKEN_TTL_MS });
    return { token, validUntil: Math.floor((Date.now() + TOKEN_TTL_MS) / 1000) };
  }

  isValid(token: string | undefined): boolean {
    if (!token) return false;
    const record = this.tokens.get(token);
    return !!record && record.expiresAt > Date.now();
  }

  kill(token: string): void {
    this.tokens.delete(token);
  }
}
