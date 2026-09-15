import assert from "node:assert/strict";
import test from "node:test";
import { assessQuality, deduplicate, mergeIncremental, relativeSpread, type Observation } from "../src/finance/data_quality.ts";
import { isTradingDay, marketDate, toUtcIso } from "../src/finance/market_time.ts";
import { US_QUOTE_SOURCES, rankedSources, recordResult, withFallback } from "../src/finance/source_resilience.ts";
import { AI_CAPEX_FIELDS, COMPANY_EVENT_ENTRIES, US_TECH_INSTRUMENTS } from "../src/finance/us_tech_monitor.ts";

const row = (source: string, value: number, sequence = 1): Observation => ({ instrument: "NVDA", field: "price", value, source, observed_at: "2026-09-15T13:30:00Z", received_at: "2026-09-15T13:30:01Z", sequence });

test("统一 UTC、市场时区与交易日", () => {
  assert.equal(toUtcIso("2026-09-15T09:30:00-04:00"), "2026-09-15T13:30:00.000Z");
  assert.equal(marketDate("2026-09-16T01:00:00Z", "US"), "2026-09-15");
  assert.equal(isTradingDay("2026-09-15"), true);
  assert.equal(isTradingDay("2026-09-19"), false);
  assert.equal(isTradingDay("2026-09-15", new Set(["2026-09-15"])), false);
});

test("去重、增量覆盖、跨源冲突与质量分", () => {
  const duplicate = [row("a", 100, 1), row("a", 101, 2)];
  assert.deepEqual(deduplicate(duplicate), { rows: [duplicate[1]!], duplicates: 1 });
  assert.equal(mergeIncremental([duplicate[0]!], [duplicate[1]!])[0]!.value, 101);
  assert.ok(relativeSpread([row("a", 100), row("b", 110)])! > 0.09);
  const report = assessQuality([...duplicate, row("b", 110)], ["price", "volume"], "2026-09-15T13:31:00Z", { maxLatencyMs: 5_000, maxMissingRatio: 0.1, maxRelativeSpread: 0.01 });
  assert.ok(report.score < 60); assert.deepEqual(report.flags.sort(), ["cross_source_conflict", "duplicate", "late", "missing"]);
});

test("源优先级、重试、熔断与备用源", async () => {
  const states = {};
  const result = await withFallback(US_QUOTE_SOURCES, states, async (source) => { if (source.id === "tx_us_quote") throw new Error("down"); return source.id; });
  assert.equal(result.source, "em_global_quote"); assert.equal(result.attempts, 3);
  const p = US_QUOTE_SOURCES[0]!; const open = recordResult(p, recordResult(p, recordResult(p, undefined, false), false), false, 10);
  assert.equal(rankedSources(US_QUOTE_SOURCES, { [p.id]: open }, 20)[0]!.id, "em_global_quote");
});

test("SOX/美股科技首批监控目录完整", () => {
  for (const id of ["US2Y", "US10Y", "DXY", "NQ", "SOX", "SOXX", "SMH", "VIX", "NVDA", "AVGO", "AMD", "TSM", "MU"]) assert.ok(US_TECH_INSTRUMENTS.some((x) => x.id === id), id);
  assert.ok(AI_CAPEX_FIELDS.includes("capex_guidance")); assert.deepEqual(COMPANY_EVENT_ENTRIES.map((x) => x.endpoint), ["sec_filings", "nasdaq_earnings_calendar", "yahoo_news"]);
});
