# @heron/loxone-mock

Mock of the Loxone Miniserver Web API for local testing of `@heron/mcp-server` without real hardware.

## What's faithful

- **Auth handshake**: `getkey2`/`gettoken` really implement `HMAC-SHA1(key, user:SHA1(password:salt))` and validate it against a configured user/password — a wrong password is genuinely rejected (401), not silently accepted.
- **Tokens**: issued with an expiry, checked on every protected endpoint (`data/LoxAPP3.json`, `jdev/sps/io/...`, the WebSocket upgrade), and invalidated by `killtoken`.
- **Device state**: in-memory per-control state (see `src/fixture.ts`), mutated by `GET /jdev/sps/io/{uuid}/{command}` (`on`/`off`/numeric), and pushed to WebSocket subscribers on change.

## Scenes (mock-only extension)

`GET /jdev/sps/scenes` lists named scenes; `GET /jdev/sps/scene/{id}` activates one, applying its whole bundle of state writes at once (e.g. `scene-good-morning`, `scene-away`, `scene-movie-night`, `scene-vacation`, `scene-good-night`, `scene-severe-weather`). This is **not a real Loxone endpoint** — real Miniservers have no generic scene concept in the structure file; scenes are normally built from virtual inputs/program blocks in Loxone Config. It exists here purely so multi-device "scene" actions can be exercised in tests. See `src/fixture.ts` (`fixtureScenes`) for the exact action lists.

## History (mock-only extension)

`GET /jdev/sps/history/{stateUuid}?from={unixSeconds}&to={unixSeconds}` returns ~90 days of synthetic hourly samples (`{ timestamp, value }`) for a handful of continuous-value states: per-room climate temps, the pool heater, the heat pump wells, the two solar arrays, and the main energy meter. `from`/`to` are optional. Values follow a seeded diurnal + slow seasonal pattern (plus solar day/cloud-cover and a rough load curve for the meter) so they look plausible, not just random noise — but the exact shape is synthetic, regenerated fresh each process start from a fixed seed (deterministic across runs).

This is **not a real Loxone endpoint**. Real Miniservers expose statistics as monthly binary files retrieved over FTP (`/stats/...`), not a documented HTTP/JSON API — replicating that binary format wasn't worth the effort for a local test double, so this is a deliberately simpler stand-in for exercising history-consuming code.

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
