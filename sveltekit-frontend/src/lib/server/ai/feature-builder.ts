export interface FeatureLabel {
  path: string;
  feature: string;
  labels: string[];
  summary: string;
  symbols: string[];
  score: number;
  protocols?: string[];
  languages?: string[];
  sourceRefs?: string[];
}

type TraceRow = {
  path?: string;
  file_path?: string;
  feature?: string;
  tags?: unknown;
  summary?: string;
  content?: string;
  symbol_name?: string;
  score?: number;
  lexical_score?: number;
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

function toRows(trace: unknown): TraceRow[] {
  if (Array.isArray(trace)) return trace as TraceRow[];
  if (trace && typeof trace === 'object' && 'results' in trace) {
    const results = (trace as { results?: unknown }).results;
    if (Array.isArray(results)) return results as TraceRow[];
  }
  if (trace && typeof trace === 'object' && 'data' in trace) {
    const data = (trace as { data?: unknown }).data;
    if (Array.isArray(data)) return data as TraceRow[];
  }
  return [];
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function buildFeatureLabels({
  trace,
  files,
  symbols,
}: {
  trace: unknown;
  files?: string[];
  symbols?: Record<string, string[]>;
}): FeatureLabel[] {
  const rows = toRows(trace);

  const mapped = rows.map((row) => {
    const path = row.path ?? row.file_path ?? 'unknown';
    const tags = toStringArray(row.tags);
    const summary = row.summary ?? row.content ?? '';
    const rowSymbols: string[] = [];
    if (typeof row.symbol_name === 'string' && row.symbol_name.length > 0) {
      rowSymbols.push(row.symbol_name);
    }
    const linkedSymbols = symbols?.[path] ?? [];

    return {
      path,
      feature: row.feature ?? (tags[0] ?? 'unknown'),
      labels: tags,
      summary,
      symbols: dedupe([...rowSymbols, ...linkedSymbols]),
      score:
        typeof row.score === 'number'
          ? row.score
          : typeof row.lexical_score === 'number'
            ? row.lexical_score
            : 0,
    } satisfies FeatureLabel;
  });

  if (mapped.length > 0) return mapped;

  return (files ?? []).map((path) => ({
    path,
    feature: 'unknown',
    labels: [],
    summary: '',
    symbols: symbols?.[path] ?? [],
    score: 0,
  }));
}
