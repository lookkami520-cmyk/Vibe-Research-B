import { parseInstant, toUtcIso } from "./market_time.ts";

export interface Observation {
  instrument: string; field: string; value: number | string | null; source: string;
  observed_at: string; received_at: string; sequence?: number;
}
export interface QualityThresholds { maxLatencyMs: number; maxMissingRatio: number; maxRelativeSpread: number; }
export interface QualityReport {
  score: number; latency_ms: number | null; missing_ratio: number; duplicate_count: number;
  outlier_count: number; cross_source_spread: number | null; flags: string[];
}

const finiteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const observationKey = (o: Observation): string => `${o.instrument}\0${o.field}\0${toUtcIso(o.observed_at)}\0${o.source}`;

export function deduplicate(rows: readonly Observation[]): { rows: Observation[]; duplicates: number } {
  const byKey = new Map<string, Observation>();
  for (const row of rows) {
    const key = observationKey(row);
    const current = byKey.get(key);
    if (!current || (row.sequence ?? -1) >= (current.sequence ?? -1)) byKey.set(key, row);
  }
  return { rows: [...byKey.values()], duplicates: rows.length - byKey.size };
}

export function relativeSpread(rows: readonly Observation[]): number | null {
  const values = rows.map((row) => row.value).filter(finiteNumber);
  if (values.length < 2) return null;
  const median = [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
  return median === 0 ? (Math.max(...values) === 0 ? 0 : Infinity) : (Math.max(...values) - Math.min(...values)) / Math.abs(median);
}

export function assessQuality(rows: readonly Observation[], expectedFields: readonly string[], now: string | Date,
  thresholds: QualityThresholds = { maxLatencyMs: 15_000, maxMissingRatio: 0.1, maxRelativeSpread: 0.01 }): QualityReport {
  const { rows: unique, duplicates } = deduplicate(rows);
  const present = new Set(unique.filter((r) => r.value !== null).map((r) => `${r.instrument}\0${r.field}`));
  const instruments = new Set(unique.map((r) => r.instrument));
  const expected = Math.max(1, instruments.size) * expectedFields.length;
  const missing = Math.max(0, expected - present.size);
  const missingRatio = expected ? missing / expected : 1;
  const nowMs = parseInstant(now).getTime();
  const latencies = unique.map((r) => nowMs - parseInstant(r.observed_at).getTime()).filter((n) => n >= 0);
  const latency = latencies.length ? Math.max(...latencies) : null;
  const groups = new Map<string, Observation[]>();
  for (const row of unique) { const key = `${row.instrument}\0${row.field}\0${toUtcIso(row.observed_at)}`; groups.set(key, [...(groups.get(key) ?? []), row]); }
  const spreads = [...groups.values()].map(relativeSpread).filter((n): n is number => n !== null);
  const spread = spreads.length ? Math.max(...spreads) : null;
  const outliers = unique.filter((r) => finiteNumber(r.value) && r.value < 0 && !/change|return|yield|rate/i.test(r.field)).length;
  const flags: string[] = [];
  if (duplicates) flags.push("duplicate");
  if (missingRatio > thresholds.maxMissingRatio) flags.push("missing");
  if (latency === null || latency > thresholds.maxLatencyMs) flags.push("late");
  if (spread !== null && spread > thresholds.maxRelativeSpread) flags.push("cross_source_conflict");
  if (outliers) flags.push("outlier");
  const score = Math.max(0, Math.round(100 - Math.min(40, missingRatio * 100) - (flags.includes("late") ? 20 : 0) - (flags.includes("cross_source_conflict") ? 20 : 0) - Math.min(10, duplicates * 2) - Math.min(10, outliers * 5)));
  return { score, latency_ms: latency, missing_ratio: missingRatio, duplicate_count: duplicates, outlier_count: outliers, cross_source_spread: spread, flags };
}

/** Incremental merge: newer sequence wins, otherwise newer received_at wins. */
export function mergeIncremental(previous: readonly Observation[], incoming: readonly Observation[]): Observation[] {
  const out = new Map<string, Observation>();
  for (const row of [...previous, ...incoming]) {
    const key = `${row.instrument}\0${row.field}\0${toUtcIso(row.observed_at)}\0${row.source}`;
    const old = out.get(key);
    if (!old || (row.sequence ?? -1) > (old.sequence ?? -1) || ((row.sequence ?? -1) === (old.sequence ?? -1) && parseInstant(row.received_at) >= parseInstant(old.received_at))) out.set(key, row);
  }
  return [...out.values()];
}
