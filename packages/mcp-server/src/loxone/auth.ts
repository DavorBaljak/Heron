import { createHash, createHmac } from "node:crypto";

export interface LoxoneToken {
  token: string;
  key: string;
  validUntil: number;
  tokenRights: number;
  unsecurePass: boolean;
}

interface LoxoneApiResponse<T> {
  LL: {
    control: string;
    code: string | number;
    value: T;
  };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Loxone request failed: ${url} (${res.status})`);
  }
  const body = (await res.json()) as LoxoneApiResponse<T>;
  return body.LL.value;
}

/**
 * getkey2 + gettoken handshake, per the documented Loxone Web API auth flow:
 * https://github.com/mr-manuel/Loxone_api_documentation
 */
export async function acquireToken(
  baseUrl: string,
  user: string,
  password: string,
  clientId: string,
  clientName: string,
): Promise<LoxoneToken> {
  const { key, salt } = await getJson<{ key: string; salt: string }>(
    `${baseUrl}/jdev/sys/getkey2/${encodeURIComponent(user)}`,
  );

  const pwHash = createHash("sha1").update(`${password}:${salt}`).digest("hex").toUpperCase();
  const hash = createHmac("sha1", Buffer.from(key, "hex"))
    .update(`${user}:${pwHash}`)
    .digest("hex");

  const permission = 2; // web app permission, per Loxone docs
  return getJson<LoxoneToken>(
    `${baseUrl}/jdev/sys/gettoken/${hash}/${encodeURIComponent(user)}/${permission}/${clientId}/${encodeURIComponent(clientName)}`,
  );
}

export async function killToken(baseUrl: string, token: string, user: string): Promise<void> {
  await getJson(`${baseUrl}/jdev/sys/killtoken/${token}/${encodeURIComponent(user)}`);
}
