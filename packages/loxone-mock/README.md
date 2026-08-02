# @heron/loxone-mock

Minimal mock of the Loxone Miniserver Web API for local testing of `@heron/mcp-server` without real hardware.

## Scope and limitations

This mock implements the *shape* of the documented request/response sequence (`getkey2` → `gettoken` → `data/LoxAPP3.json`), but **does not implement real Loxone cryptography**: it accepts any client-supplied auth hash without validating it. It is useful for:

- exercising a client's control flow (does it call the right endpoints, in the right order, with the right headers),
- exercising structure-file parsing and discovery-tool logic against a known fixture (`src/fixture.ts`).

It is **not** a substitute for testing against a real Miniserver — it will not catch bugs in the actual RSA/HMAC handshake logic.

## Usage

```bash
npm run dev --workspace=@heron/loxone-mock
# listens on http://localhost:8080 (override with PORT=...)
```

Point `@heron/mcp-server` at it with `LOXONE_HOST=localhost:8080`.
