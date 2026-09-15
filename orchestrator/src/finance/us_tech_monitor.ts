export const US_TECH_INSTRUMENTS = [
  { id: "US2Y", label: "美国 2 年期国债收益率", kind: "macro", endpoint: "treasury_yield_curve", field: "2Y" },
  { id: "US10Y", label: "美国 10 年期国债收益率", kind: "macro", endpoint: "treasury_yield_curve", field: "10Y" },
  { id: "DXY", label: "美元指数", kind: "macro", endpoint: "em_global_quote", symbol: "DXY" },
  { id: "NQ", label: "纳指期货", kind: "index", endpoint: "em_global_quote", symbol: "NQ" },
  { id: "SOX", label: "费城半导体指数", kind: "index", endpoint: "em_global_quote", symbol: "SOX" },
  { id: "SOXX", label: "iShares 半导体 ETF", kind: "etf", endpoint: "tx_us_quote", symbol: "SOXX" },
  { id: "SMH", label: "VanEck 半导体 ETF", kind: "etf", endpoint: "tx_us_quote", symbol: "SMH" },
  { id: "VIX", label: "波动率指数", kind: "risk", endpoint: "em_global_quote", symbol: "VIX" },
  ...["NVDA", "AVGO", "AMD", "TSM", "MU"].map((symbol) => ({ id: symbol, label: symbol, kind: "equity", endpoint: "tx_us_quote", symbol })),
] as const;

export const US_TECH_QUOTE_FIELDS = ["price", "change_percent", "volume", "turnover", "market_cap", "pe_ttm", "observed_at", "received_at", "source", "quality_score", "latency_ms"] as const;
export const AI_CAPEX_FIELDS = ["capex", "capex_guidance", "data_center_revenue", "inventory", "purchase_commitments", "customer_concentration"] as const;
export const COMPANY_EVENT_ENTRIES = [
  { id: "sec", endpoint: "sec_filings", forms: ["8-K", "10-Q", "10-K", "4"] },
  { id: "earnings", endpoint: "nasdaq_earnings_calendar" },
  { id: "news", endpoint: "yahoo_news" },
] as const;
