import type { LoxoneCategory, LoxoneControl, LoxoneRoom, LoxoneStructure } from "./types.js";

interface RawLoxAPP3 {
  rooms?: Record<string, { name?: string }>;
  cats?: Record<string, { name?: string; type?: string }>;
  controls?: Record<string, { name?: string; type?: string; room?: string; cat?: string; states?: Record<string, string> }>;
}

export function parseStructure(raw: unknown): LoxoneStructure {
  const data = raw as RawLoxAPP3;

  const rooms: Record<string, LoxoneRoom> = {};
  for (const [uuid, room] of Object.entries(data.rooms ?? {})) {
    rooms[uuid] = { uuid, name: room.name ?? uuid };
  }

  const cats: Record<string, LoxoneCategory> = {};
  for (const [uuid, cat] of Object.entries(data.cats ?? {})) {
    cats[uuid] = { uuid, name: cat.name ?? uuid, type: cat.type ?? "unknown" };
  }

  const controls: Record<string, LoxoneControl> = {};
  for (const [uuid, control] of Object.entries(data.controls ?? {})) {
    controls[uuid] = {
      uuid,
      name: control.name ?? uuid,
      type: control.type ?? "unknown",
      room: control.room,
      cat: control.cat,
      states: control.states,
    };
  }

  return { rooms, cats, controls };
}
