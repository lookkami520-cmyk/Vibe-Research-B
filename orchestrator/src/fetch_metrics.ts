export interface FetchQuality {
  score: number;
  status: "good" | "degraded" | "failed";
  latency_ms: number;
  evidence_count: number;
  duplicate_count: number;
  invalid_count: number;
  source_count: number;
  flags: string[];
}

interface EndpointMetrics {
  requests: number;
  successes: number;
  failures: number;
  cache_hits: number;
  latency_total_ms: number;
  latency_max_ms: number;
  last_quality_score: number | null;
  last_seen_at: string;
}

const roots = new Map<string, Map<string, EndpointMetrics>>();

const evidenceOf = (envelope: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(envelope.evidence)
    ? envelope.evidence.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];

export function assessFetchQuality(envelope: Record<string, unknown>, latencyMs: number): FetchQuality {
  const evidence = evidenceOf(envelope);
  const keys = new Set<string>();
  const sources = new Set<string>();
  let duplicates = 0;
  let invalid = 0;
  for (const item of evidence) {
    const key = String(item.id ?? `${item.symbol ?? ""}\u0000${item.field ?? ""}\u0000${item.period ?? ""}\u0000${item.source ?? ""}`);
    if (keys.has(key)) duplicates += 1;
    keys.add(key);
    if (item.source) sources.add(String(item.source));
    if (!item.field || item.value === undefined || item.value === null || (typeof item.value === "number" && !Number.isFinite(item.value))) invalid += 1;
  }

  const declared = envelope.status;
  const flags: string[] = [];
  if (declared === "failed") flags.push("source_failed");
  else if (declared === "partial") flags.push("partial");
  if (evidence.length === 0) flags.push("missing");
  if (duplicates) flags.push("duplicate");
  if (invalid) flags.push("invalid");
  if (latencyMs > 5_000) flags.push("late");

  const score = Math.max(0, Math.round(100
    - (declared === "failed" ? 50 : declared === "partial" ? 15 : 0)
    - (evidence.length === 0 ? 35 : 0)
    - Math.min(10, duplicates * 2)
    - Math.min(20, invalid * 5)
    - (latencyMs > 5_000 ? 15 : latencyMs > 2_000 ? 5 : 0)));
  return {
    score,
    status: score >= 80 ? "good" : score > 0 ? "degraded" : "failed",
    latency_ms: Math.max(0, Math.round(latencyMs)),
    evidence_count: evidence.length,
    duplicate_count: duplicates,
    invalid_count: invalid,
    source_count: sources.size,
    flags,
  };
}

export function recordFetchMetric(dataRoot: string, endpoint: string, input: { cached: boolean; ok: boolean; latency_ms: number; quality: FetchQuality }): void {
  let byEndpoint = roots.get(dataRoot);
  if (!byEndpoint) { byEndpoint = new Map(); roots.set(dataRoot, byEndpoint); }
  const old = byEndpoint.get(endpoint) ?? { requests: 0, successes: 0, failures: 0, cache_hits: 0, latency_total_ms: 0, latency_max_ms: 0, last_quality_score: null, last_seen_at: "" };
  const latency = Math.max(0, Math.round(input.latency_ms));
  byEndpoint.set(endpoint, {
    requests: old.requests + 1,
    successes: old.successes + (input.ok ? 1 : 0),
    failures: old.failures + (input.ok ? 0 : 1),
    cache_hits: old.cache_hits + (input.cached ? 1 : 0),
    latency_total_ms: old.latency_total_ms + latency,
    latency_max_ms: Math.max(old.latency_max_ms, latency),
    last_quality_score: input.quality.score,
    last_seen_at: new Date().toISOString(),
  });
}

export function fetchMetricsSnapshot(dataRoot: string): {
  generated_at: string;
  totals: { requests: number; successes: number; failures: number; cache_hits: number; cache_hit_ratio: number; average_latency_ms: number };
  endpoints: Record<string, EndpointMetrics & { average_latency_ms: number }>;
} {
  const rows = roots.get(dataRoot) ?? new Map();
  const endpoints: Record<string, EndpointMetrics & { average_latency_ms: number }> = {};
  let requests = 0, successes = 0, failures = 0, cacheHits = 0, latencyTotal = 0;
  for (const [endpoint, row] of [...rows.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    endpoints[endpoint] = { ...row, average_latency_ms: row.requests ? Math.round(row.latency_total_ms / row.requests) : 0 };
    requests += row.requests; successes += row.successes; failures += row.failures; cacheHits += row.cache_hits; latencyTotal += row.latency_total_ms;
  }
  return {
    generated_at: new Date().toISOString(),
    totals: {
      requests, successes, failures, cache_hits: cacheHits,
      cache_hit_ratio: requests ? Number((cacheHits / requests).toFixed(4)) : 0,
      average_latency_ms: requests ? Math.round(latencyTotal / requests) : 0,
    },
    endpoints,
  };
}

export function resetFetchMetrics(dataRoot?: string): void {
  if (dataRoot === undefined) roots.clear(); else roots.delete(dataRoot);
}
