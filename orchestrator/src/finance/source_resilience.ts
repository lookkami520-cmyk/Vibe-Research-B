export type SourceTier = "primary" | "secondary" | "fallback";
export interface SourcePolicy { id: string; tier: SourceTier; priority: number; timeoutMs: number; maxAttempts: number; circuitFailureThreshold: number; circuitResetMs: number; }
export interface CircuitState { failures: number; openedAt: number | null; }

export function rankedSources(policies: readonly SourcePolicy[], states: Readonly<Record<string, CircuitState>>, now = Date.now()): SourcePolicy[] {
  return [...policies].filter((p) => { const s = states[p.id]; return !s?.openedAt || now - s.openedAt >= p.circuitResetMs; }).sort((a, b) => a.priority - b.priority);
}

export function recordResult(policy: SourcePolicy, state: CircuitState | undefined, ok: boolean, now = Date.now()): CircuitState {
  if (ok) return { failures: 0, openedAt: null };
  const failures = (state?.failures ?? 0) + 1;
  return { failures, openedAt: failures >= policy.circuitFailureThreshold ? now : null };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, source: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`source timeout:${source}`)), timeoutMs); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function withFallback<T>(policies: readonly SourcePolicy[], states: Record<string, CircuitState>, run: (source: SourcePolicy, attempt: number) => Promise<T>, now = Date.now()): Promise<{ value: T; source: string; attempts: number }> {
  let attempts = 0; let last: unknown = new Error("no source available");
  for (const source of rankedSources(policies, states, now)) {
    for (let attempt = 1; attempt <= source.maxAttempts; attempt++) {
      attempts += 1;
      try {
        const value = await withTimeout(run(source, attempt), source.timeoutMs, source.id);
        states[source.id] = recordResult(source, states[source.id], true, now); return { value, source: source.id, attempts };
      } catch (error) { last = error; states[source.id] = recordResult(source, states[source.id], false, now); if (states[source.id]!.openedAt) break; }
    }
  }
  throw last;
}

export const US_QUOTE_SOURCES: readonly SourcePolicy[] = [
  { id: "tx_us_quote", tier: "primary", priority: 10, timeoutMs: 2_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
  { id: "em_global_quote", tier: "secondary", priority: 20, timeoutMs: 2_500, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 60_000 },
  { id: "sina_us_quote", tier: "fallback", priority: 30, timeoutMs: 3_000, maxAttempts: 1, circuitFailureThreshold: 2, circuitResetMs: 120_000 },
] as const;
