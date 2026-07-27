export interface ProofPostgresPacketRow {
  packet_key: string | null;
  packet_id?: string | null;
  source_ref: string | null;
  feature_id: string | null;
  directory_path?: string | null;
  canonical_source_ref?: string | null;
  file_path?: string | null;
  feature_label?: string | null;
  content_hash?: string | null;
  tree_node_id?: string | null;
  ontology_version?: string | null;
  summary?: string | null;
}

export function parsePostgresJsonRows(raw: string): ProofPostgresPacketRow[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`POSTGRES_JSON_PARSE_FAILED: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('POSTGRES_JSON_PARSE_FAILED: expected top-level JSON array');
  }

  return parsed.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`POSTGRES_JSON_PARSE_FAILED: row ${index} is not a JSON object`);
    }
    return row as ProofPostgresPacketRow;
  });
}

export function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}
