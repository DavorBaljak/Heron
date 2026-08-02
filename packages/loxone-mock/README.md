# @heron/loxone-mock

Mock of the Loxone Miniserver Web API for local testing of `@heron/mcp-server` without real hardware.

## What's faithful

- **Auth handshake**: `getkey2`/`gettoken` really implement `HMAC-SHA1(key, user:SHA1(password:salt))` and validate it against a configured user/password — a wrong password is genuinely rejected (401), not silently accepted.
- **Tokens**: issued with an expiry, checked on every protected endpoint (`data/LoxAPP3.json`, `jdev/sps/io/...`, the WebSocket upgrade), and invalidated by `killtoken`.
- **Device state**: in-memory per-control state (see `src/fixture.ts`), mutated by `GET /jdev/sps/io/{uuid}/{command}` (`on`/`off`/numeric), and pushed to WebSocket subscribers on change.

## Known simplification

Real Loxone WebSocket push (`ws://{host}/ws/rfc6455`) uses a proprietary binary message-header framing that isn't fully documented publicly. This mock instead:
- authenticates the WS upgrade via a `?token=` query parameter (real Loxone does this differently),
- pushes plain JSON text frames (`{ "uuid": ..., "value": ... }`) per state change, instead of the real binary event-table format.

This is enough to exercise a client's subscribe/handle-update logic, but is not a byte-for-byte replica of the real wire format — don't rely on it to catch bugs in binary frame parsing against a real Miniserver.

## Usage

```bash
npm run dev --workspace=@heron/loxone-mock
# listens on http://localhost:8080 (override with PORT)
```

Default credentials: `test` / `test`. Point `@heron/mcp-server` at it with `LOXONE_HOST=localhost:8080`.

## Tests

```bash
npm test --workspace=@heron/loxone-mock
```
