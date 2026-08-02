export interface LoxoneRoom {
  uuid: string;
  name: string;
}

export interface LoxoneCategory {
  uuid: string;
  name: string;
  type: string;
}

export interface LoxoneControl {
  uuid: string;
  name: string;
  type: string;
  room?: string;
  cat?: string;
  states?: Record<string, string>;
}

export interface LoxoneStructure {
  rooms: Record<string, LoxoneRoom>;
  cats: Record<string, LoxoneCategory>;
  controls: Record<string, LoxoneControl>;
}

export interface LoxoneScene {
  id: string;
  name: string;
  description: string;
}

export interface LoxoneHistorySample {
  timestamp: number;
  value: number | string;
}

export interface LoxoneClientOptions {
  host: string;
  user: string;
  password: string;
  clientId?: string;
  clientName?: string;
  structureCacheMs?: number;
}
