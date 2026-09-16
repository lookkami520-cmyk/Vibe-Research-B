import assert from "node:assert/strict";
import test from "node:test";
import { assessFetchQuality, fetchMetricsSnapshot, recordFetchMetric, resetFetchMetrics } from "../src/fetch_metrics.ts";

test("quality diagnostics flag empty, duplicate, invalid and slow envelopes", () => {
  const empty = assessFetchQuality({ status: "failed", evidence: [] }, 6_000);
  assert.equal(empty.score, 0);
  assert.deepEqual(empty.flags, ["source_failed", "missing", "late"]);

  const degraded = assessFetchQuality({ status: "partial", evidence: [
    { id: "ev-1", field: "price", value: 10, source: "a" },
    { id: "ev-1", field: "price", value: 11, source: "a" },
    { id: "ev-2", field: "volume", value: null, source: "b" },
  ] }, 2_500);
  assert.equal(degraded.status, "degraded");
  assert.equal(degraded.duplicate_count, 1);
  assert.equal(degraded.invalid_count, 1);
  assert.equal(degraded.source_count, 2);
});

test("metrics aggregate cache, success, failure and latency without exposing payloads", () => {
  const root = "metrics-test";
  resetFetchMetrics(root);
  const good = assessFetchQuality({ status: "ok", evidence: [{ id: "a", field: "price", value: 1, source: "x" }] }, 100);
  const bad = assessFetchQuality({ status: "failed", evidence: [] }, 900);
  recordFetchMetric(root, "quote", { cached: false, ok: true, latency_ms: 100, quality: good });
  recordFetchMetric(root, "quote", { cached: true, ok: true, latency_ms: 0, quality: good });
  recordFetchMetric(root, "macro", { cached: false, ok: false, latency_ms: 900, quality: bad });
  const metrics = fetchMetricsSnapshot(root);
  assert.deepEqual(metrics.totals, { requests: 3, successes: 2, failures: 1, cache_hits: 1, cache_hit_ratio: 0.3333, average_latency_ms: 333 });
  assert.equal(metrics.endpoints.quote.average_latency_ms, 50);
  assert.equal(JSON.stringify(metrics).includes("evidence"), false);
  resetFetchMetrics(root);
});
