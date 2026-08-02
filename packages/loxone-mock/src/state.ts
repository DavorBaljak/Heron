import { EventEmitter } from "node:events";

export interface StateUpdate {
  uuid: string;
  value: number | string;
}

export class StateStore extends EventEmitter {
  private readonly values = new Map<string, number | string>();

  init(initial: Record<string, number | string>): void {
    for (const [uuid, value] of Object.entries(initial)) {
      this.values.set(uuid, value);
    }
  }

  get(uuid: string): number | string | undefined {
    return this.values.get(uuid);
  }

  set(uuid: string, value: number | string): void {
    this.values.set(uuid, value);
    this.emit("update", { uuid, value } satisfies StateUpdate);
  }

  all(): StateUpdate[] {
    return [...this.values.entries()].map(([uuid, value]) => ({ uuid, value }));
  }
}
