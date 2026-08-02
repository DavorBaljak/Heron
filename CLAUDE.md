# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Codename: **Heron**. npm workspaces monorepo with `packages/shared`, `packages/mcp-server`, `packages/agent`, and `packages/loxone-mock`. Discovery-tier MCP tools (`list_rooms`, `list_categories`, `list_controls`, `get_control`, `list_scenes`) are implemented and tested against the mock Miniserver; monitoring and action tiers are not yet implemented. The mock's house fixture (`packages/loxone-mock/src/fixture.ts`) covers 14 rooms and 43 controls (lighting, shading, per-room climate, audio, security/CCTV, pool, solar PV, heat pump wells, irrigation) plus 6 named scenes and ~90 days of synthetic history for 9 continuous-value sensors.

`@heron/agent` is a CLI chat loop backed by Claude (Anthropic API) with an Anthropic tool-use loop wired to the MCP server's tools — it spawns `@heron/mcp-server` as a child process over stdio (`packages/agent/src/mcpClient.ts`) and never opens any other connection. Since only discovery-tier (read-only) tools exist so far, there's no confirmation-flow yet; that must be added to the agent's tool-use loop before any action-tier tool is introduced (see ARCHITECTURE.md #4).

## Commands

- `npm install` — install all workspace dependencies (run from repo root).
- `npm run build` — build all packages.
- `npm test --workspace=@heron/mcp-server` — run `@heron/mcp-server`'s tests (Node's built-in test runner via `tsx --test`), including the integration test that spins up `@heron/loxone-mock` in-process.
- `npm test --workspace=@heron/loxone-mock` — run the mock's own tests (auth validation, command/state mutation, WebSocket push).
- `npm run dev --workspace=@heron/loxone-mock` — start the mock Miniserver standalone (default port 8080, override with `PORT`; default credentials `test`/`test`).
- `npm run dev --workspace=@heron/mcp-server` — start the MCP server over stdio; requires `LOXONE_HOST`, `LOXONE_USER`, `LOXONE_PASSWORD` env vars (point `LOXONE_HOST` at the mock, e.g. `localhost:8080`, for local testing).
- `npm run dev --workspace=@heron/agent` — start the CLI agent; requires `ANTHROPIC_API_KEY` plus the same `LOXONE_HOST`/`LOXONE_USER`/`LOXONE_PASSWORD` (passed through to the `mcp-server` child process it spawns). Optional `ANTHROPIC_MODEL` (default `claude-sonnet-5`), `MCP_SERVER_ENTRY` to point at a different mcp-server entry file.
- Both `mcp-server` and `agent` auto-load a repo-root `.env` file on startup (via Node's built-in `process.loadEnvFile`, no dotenv dependency) if one exists — copy the values above into `.env` (gitignored) instead of exporting them manually each time.
- `npm test --workspace=@heron/agent` — runs the agent's unit tests (MCP→Anthropic tool-schema conversion only; the chat loop itself needs a real `ANTHROPIC_API_KEY` and isn't covered by automated tests).

`@heron/loxone-mock` (see its README) genuinely validates the getkey2/gettoken HMAC auth handshake and mutates real in-memory device state via `/jdev/sps/io/{uuid}/{command}`, pushing updates over a `/ws/rfc6455` WebSocket. Its one known simplification: WS push uses plain JSON frames rather than Loxone's undocumented proprietary binary framing.

## What this project is

Heron is an AI layer on top of an existing Loxone home-automation system, designed to be system-agnostic so other home-automation backends can be added later. It does not replace Loxone's own automation logic (Config/rules running on the Miniserver). Instead it adds a natural-language interface that interprets current system state and suggests changes, using broader context (weather forecast, calendar/vacations, guests, etc.) to help optimize the existing Loxone setup.

Read `ARCHITECTURE.md` in full before making any implementation decisions — it defines the required architecture and is not optional background reading. Key constraints from that document that any future code must respect:

- **Three strict MCP tool tiers**: discovery (read-only, static), monitoring (read-only, dynamic/state), action (write). Action-tier tools require explicit user confirmation before execution and must be logged.
- **Agent never talks to the Loxone Miniserver directly.** The agent's only surface is the MCP server's whitelisted tools — it must never hold Loxone credentials or have a direct network path to the Miniserver.
- **Network isolation**: MCP server and agent are intended to run entirely within the closed home network, with no inbound/outbound access from outside it.
- **Data-filtering rules before anything reaches an LLM**: some state (room/device names, generic status) can be passed freely; some (presence, behavioral patterns) must be aggregated/anonymized; some (raw real-time presence/location, security camera/alarm detail) must never be sent to a cloud/SOTA model — only to a local LLM, if at all.
- Planned stack: TypeScript/Node, using the official MCP TypeScript SDK, integrating with the Loxone Miniserver via its Web/WebSocket API (`data/LoxAPP3.json` structure file, token-based auth, `ws://{host}/ws/rfc6455`).

When implementing, follow the tiering and confirmation-flow rules in `ARCHITECTURE.md` exactly as specified rather than inventing a different security model.
