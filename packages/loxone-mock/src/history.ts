export interface HistorySample {
  timestamp: number;
  value: number;
}

const HISTORY_DAYS = 90;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function seededRandom(seedStr: string): () => number {
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed * 31 + seedStr.charCodeAt(i)) | 0;
  }
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DiurnalParams {
  base: number;
  diurnalAmplitude: number;
  seasonalAmplitude: number;
  noise: number;
  peakHour: number;
}

/** Diurnal cycle + a slow seasonal trend rising toward "now" + noise. */
function diurnalSeries(seed: string, params: DiurnalParams): HistorySample[] {
  const rand = seededRandom(seed);
  const now = Date.now();
  const totalHours = HISTORY_DAYS * 24;
  const samples: HistorySample[] = [];
  for (let h = totalHours; h >= 0; h--) {
    const timestamp = now - h * HOUR_MS;
    const date = new Date(timestamp);
    const hourOfDay = date.getUTCHours() + date.getUTCMinutes() / 60;
    const dayFraction = (totalHours - h) / totalHours;
    const diurnal = params.diurnalAmplitude * Math.sin(((hourOfDay - params.peakHour) / 24) * 2 * Math.PI);
    const seasonal = params.seasonalAmplitude * Math.sin(dayFraction * Math.PI - Math.PI / 2);
    const noise = (rand() - 0.5) * 2 * params.noise;
    const value = params.base + diurnal + seasonal + noise;
    samples.push({ timestamp, value: Math.round(value * 100) / 100 });
  }
  return samples;
}

/** Daylight bell curve around peakHour, zero at night, with a per-day cloud-cover factor. */
function solarSeries(seed: string, peakKw: number, peakHour: number): HistorySample[] {
  const rand = seededRandom(seed);
  const now = Date.now();
  const totalHours = HISTORY_DAYS * 24;
  const samples: HistorySample[] = [];
  let cloudFactor = 1;
  let lastDayIndex = -1;
  for (let h = totalHours; h >= 0; h--) {
    const timestamp = now - h * HOUR_MS;
    const dayIndex = Math.floor(timestamp / DAY_MS);
    if (dayIndex !== lastDayIndex) {
      cloudFactor = 0.5 + rand() * 0.5;
      lastDayIndex = dayIndex;
    }
    const date = new Date(timestamp);
    const hourOfDay = date.getUTCHours() + date.getUTCMinutes() / 60;
    const withinDaylight = hourOfDay > peakHour - 6 && hourOfDay < peakHour + 6;
    const bell = withinDaylight ? Math.max(0, Math.cos(((hourOfDay - peakHour) / 12) * Math.PI)) ** 2 : 0;
    const value = Math.max(0, peakKw * bell * cloudFactor + (rand() - 0.5) * 0.1);
    samples.push({ timestamp, value: Math.round(value * 100) / 100 });
  }
  return samples;
}

const seriesBuilders: Record<string, () => HistorySample[]> = {
  "state-living-climate-temp": () =>
    diurnalSeries("state-living-climate-temp", { base: 21, diurnalAmplitude: 1.2, seasonalAmplitude: 2, noise: 0.3, peakHour: 16 }),
  "state-kitchen-climate-temp": () =>
    diurnalSeries("state-kitchen-climate-temp", { base: 21.5, diurnalAmplitude: 1.5, seasonalAmplitude: 2, noise: 0.3, peakHour: 18 }),
  "state-master-climate-temp": () =>
    diurnalSeries("state-master-climate-temp", { base: 20, diurnalAmplitude: 0.8, seasonalAmplitude: 1.5, noise: 0.2, peakHour: 15 }),
  "state-pool-heater-temp": () =>
    diurnalSeries("state-pool-heater-temp", { base: 26, diurnalAmplitude: 0.5, seasonalAmplitude: 1.5, noise: 0.2, peakHour: 16 }),
  "state-well-inlet-temp": () =>
    diurnalSeries("state-well-inlet-temp", { base: 12.2, diurnalAmplitude: 0.1, seasonalAmplitude: 0.6, noise: 0.1, peakHour: 14 }),
  "state-well-outlet-temp": () =>
    diurnalSeries("state-well-outlet-temp", { base: 8, diurnalAmplitude: 0.1, seasonalAmplitude: 0.4, noise: 0.1, peakHour: 14 }),
  "state-utility-meter-power": () =>
    diurnalSeries("state-utility-meter-power", { base: 700, diurnalAmplitude: 350, seasonalAmplitude: 100, noise: 100, peakHour: 19 }),
  "state-solar-east-power": () => solarSeries("state-solar-east-power", 6, 9),
  "state-solar-west-power": () => solarSeries("state-solar-west-power", 6, 15),
};

let cache: Map<string, HistorySample[]> | undefined;

function getAllSeries(): Map<string, HistorySample[]> {
  if (!cache) {
    cache = new Map(Object.entries(seriesBuilders).map(([uuid, build]) => [uuid, build()]));
  }
  return cache;
}

export function hasHistory(stateUuid: string): boolean {
  return getAllSeries().has(stateUuid);
}

export function getHistory(stateUuid: string, from?: number, to?: number): HistorySample[] {
  const series = getAllSeries().get(stateUuid) ?? [];
  return series.filter((sample) => (from === undefined || sample.timestamp >= from) && (to === undefined || sample.timestamp <= to));
}
