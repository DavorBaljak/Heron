# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Codename: **Heron**. This repository currently contains only `ARCHITECTURE.md` — no code has been written yet. There are no build, lint, or test commands to run because no project has been scaffolded.

## What this project is

Heron is an AI layer on top of an existing Loxone home-automation system, designed to be system-agnostic so other home-automation backends can be added later. It does not replace Loxone's own automation logic (Config/rules running on the Miniserver). Instead it adds a natural-language interface that interprets current system state and suggests changes, using broader context (weather forecast, calendar/vacations, guests, etc.) to help optimize the existing Loxone setup.

Read `ARCHITECTURE.md` in full before making any implementation decisions — it defines the required architecture and is not optional background reading. Key constraints from that document that any future code must respect:

- **Three strict MCP tool tiers**: discovery (read-only, static), monitoring (read-only, dynamic/state), action (write). Action-tier tools require explicit user confirmation before execution and must be logged.
- **Agent never talks to the Loxone Miniserver directly.** The agent's only surface is the MCP server's whitelisted tools — it must never hold Loxone credentials or have a direct network path to the Miniserver.
- **Network isolation**: MCP server and agent are intended to run entirely within the closed home network, with no inbound/outbound access from outside it.
- **Data-filtering rules before anything reaches an LLM**: some state (room/device names, generic status) can be passed freely; some (presence, behavioral patterns) must be aggregated/anonymized; some (raw real-time presence/location, security camera/alarm detail) must never be sent to a cloud/SOTA model — only to a local LLM, if at all.
- Planned stack: TypeScript/Node, using the official MCP TypeScript SDK, integrating with the Loxone Miniserver via its Web/WebSocket API (`data/LoxAPP3.json` structure file, token-based auth, `ws://{host}/ws/rfc6455`).

When implementing, follow the tiering and confirmation-flow rules in `ARCHITECTURE.md` exactly as specified rather than inventing a different security model.
