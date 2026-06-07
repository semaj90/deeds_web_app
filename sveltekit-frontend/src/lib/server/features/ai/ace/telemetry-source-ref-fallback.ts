export interface TelemetryFallbackRow {
  source_ref: string | null;
  relative_path: string | null;
  som_cluster: number | null;
}

export interface TelemetryFallbackInput {
  sourceRefs: string[];
  qdrantPointIds: Array<string | number>;
  packetSomCluster?: string | null;
  rows: TelemetryFallbackRow[];
}

export interface TelemetryFallbackOutput {
  sourceRefs: string[];
  somCluster: string;
}

export function normalizeTelemetrySourceRef(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  let ref = value.trim().replace(/\\/g, '/');
  if (!ref) return null;

  const repoMarker = '/deeds-web-app/';
  const repoIdx = ref.indexOf(repoMarker);
  if (repoIdx >= 0) ref = ref.slice(repoIdx + repoMarker.length);

  const frontendMarker = '/sveltekit-frontend/';
  const frontendIdx = ref.indexOf(frontendMarker);
  if (frontendIdx >= 0) ref = `sveltekit-frontend/${ref.slice(frontendIdx + frontendMarker.length)}`;

  ref = ref
    .replace(/^file:\/+/, '')
    .replace(/^file:/, '')
    .replace(/^(\.\.\/)+/, '')
    .replace(/^\.\/+/, '')
    .replace(/\/+/g, '/');
  ref = ref.replace(/:\d+(?::\d+)?$/, '');

  if (ref === 'unknown' || ref.endsWith('/unknown')) return null;
  if (/^(node_modules|\.svelte-kit|\.vite|dist|build)\//.test(ref)) return null;
  // Reject venv, non-source assets, and binary/data files
  if (/\.(venv|venv2|venv3|env)\//.test(ref)) return null;
  if (/\.venv\//.test(ref)) return null;
  if (/\.(md|json|jsonl|ndjson|parquet|duckdb|sql|txt|log|csv|yaml|yml|toml|lock|png|jpg|gif|svg|ico|wasm|bin|node)$/.test(ref)) return null;
  // Only keep src/** and scripts/** that live under sveltekit-frontend
  if (ref.startsWith('src/')) ref = `sveltekit-frontend/${ref}`;

  return ref;
}

export function telemetrySourceRefFromContext(context: Record<string, unknown> | null | undefined): string | null {
  if (!context) return null;
  return normalizeTelemetrySourceRef(
    context.candidateSourceRef ??
      context.sourceRef ??
      context.source_ref ??
      context.relativePath ??
      context.relative_path ??
      context.path ??
      context.filePath ??
      context.stableKey ??
      context.id
  );
}

export function normalizeTelemetrySourceRefs(values: unknown[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => normalizeTelemetrySourceRef(value))
        .filter((ref): ref is string => Boolean(ref))
    ),
  ];
}

export function resolveTelemetryPacketFallbacks(input: TelemetryFallbackInput): TelemetryFallbackOutput {
  const existingSourceRefs = normalizeTelemetrySourceRefs(input.sourceRefs);
  const resolvedSourceRefs = existingSourceRefs.length > 0
    ? existingSourceRefs
    : input.rows
        .map((row) => row.source_ref ?? row.relative_path ?? null)
        .map((ref) => normalizeTelemetrySourceRef(ref))
        .filter((ref): ref is string => Boolean(ref));

  const resolvedSomCluster =
    input.packetSomCluster?.trim() ||
    input.rows
      .map((row) => row.som_cluster)
      .find((value): value is number => value != null)
      ?.toString() ||
    '';

  // Preserve only unique refs and ignore empty strings.
  return {
    sourceRefs: [...new Set(resolvedSourceRefs)],
    somCluster: resolvedSomCluster,
  };
}
