import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { fixtureStructure } from "./fixture.js";

/**
 * Minimal mock of the Loxone Miniserver Web API, for exercising an MCP
 * server's control flow and structure-file parsing.
 *
 * This does NOT implement real Loxone cryptography: getkey2/gettoken accept
 * any client-supplied hash without validating it. It is not a substitute for
 * testing against a real Miniserver — only for testing that a client walks
 * the documented request sequence correctly and parses responses correctly.
 */
export function createMockLoxoneServer(): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://mock");
    const send = (value: unknown, code: string | number = 200) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ LL: { control: url.pathname, code, value } }));
    };

    if (url.pathname.startsWith("/jdev/sys/getkey2/")) {
      send({ key: randomBytes(16).toString("hex"), salt: randomBytes(8).toString("hex") });
      return;
    }

    if (url.pathname.startsWith("/jdev/sys/gettoken/")) {
      send({
        token: `mock-token-${randomBytes(8).toString("hex")}`,
        key: randomBytes(16).toString("hex"),
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        tokenRights: 4,
        unsecurePass: false,
      });
      return;
    }

    if (url.pathname.startsWith("/jdev/sys/killtoken/")) {
      send({});
      return;
    }

    if (url.pathname === "/data/LoxAPP3.json") {
      if (!req.headers.authorization) {
        res.writeHead(401);
        res.end();
        return;
      }
      // The structure file endpoint returns the raw structure JSON directly
      // (not wrapped in the {LL: {...}} envelope used by /jdev endpoints).
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(fixtureStructure));
      return;
    }

    res.writeHead(404);
    res.end();
  });
}
