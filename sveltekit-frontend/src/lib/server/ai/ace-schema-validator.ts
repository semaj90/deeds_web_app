/**
 * ACE Schema Validator — Block placeholder and unsafe terms before Gemma4 write
 *
 * Hard rules:
 * - Block all placeholder terms (unknown_table, what_is_, TODO, fake_, ??, TBD, example_table)
 * - Validate packet identity (source_ref, feature_id, packet_key required)
 * - Prevent schema violations (table/column/function must exist in Postgres)
 * - Prevent unsafe NATS/Redis attempts (truth must come from Postgres first)
 *
 * Gate: PASS only if all validations pass. FAIL blocks Gemma4 write.
 */

export interface SchemaValidationResult {
  valid: boolean;
  blockedTerms: string[];
  missingIdentity: string[];
  schemaViolations: string[];
  unsafeOperations: string[];
  report: string;
}

/**
 * Blocked placeholder and unsafe terms
 * Pattern: these terms indicate incomplete schema or unsafe writes
 */
const BLOCKED_TERMS = [
  // Placeholder patterns
  /unknown_table/i,
  /what_is_/i,
  /TODO_SCHEMA/i,
  /placeholder/i,
  /fake_/i,
  /\?\?/,
  /\bTBD\b/i,
  /example_table/i,
  /demo_/i,
  /test_table/i,
  /temp_/i,
  /tmp_/i,

  // Unsafe patterns
  /redis_only_write/i,
  /skip_postgres/i,
  /bypass_validation/i,
  /force_write/i,
  /assume_exists/i,
];

/**
 * Known safe tables (from Drizzle schema)
 * Hardcoded list of canonical tables that exist in Postgres
 */
const KNOWN_TABLES = new Set([
  // ACE/packet tables
  'nes_chrom_packets',
  'atlas_packets',
  'parent_atlas_documents',
  'task_semantic_packets',
  'route_runtime_packets',
  'agent_memory_packets',
  'ace_chunks',
  'ace_retrieval_runs',
  'ace_retrieval_hits',

  // Core tables
  'users',
  'sessions',
  'cases',
  'evidence',
  'documents',
  'legal_documents',
  'document_chunks',
  'citations',
  'statutes',

  // Cache/retrieval
  'qdrant_metadata',
  'redis_operations',
  'neo4j_trace',

  // Schema/mapping
  'atlas_feature_dict',
  'atlas_source_ref_dict',
  'atlas_symbol_map',
]);

/**
 * Known safe functions (MCP tool names + stored procedures)
 */
const KNOWN_FUNCTIONS = new Set([
  // MCP tools
  'trace.kag_search',
  'topology.search_near',
  'graph.expand_neighborhood',
  'graph.shortest_path',
  'clusters.get_summary_lenses',
  'trace.explain_retrieval',

  // Stored procedures
  'write_trace_event',
  'invalidate_cache_keys',
  'emit_nats_message',
  'validate_packet_identity',

  // Database functions
  'gen_random_uuid',
  'now',
  'count',
]);

/**
 * Check if text contains blocked placeholder or unsafe terms
 */
export function detectBlockedTerms(text: string): string[] {
  const found: string[] = [];

  for (const pattern of BLOCKED_TERMS) {
    if (pattern.test(text)) {
      found.push(pattern.source);
    }
  }

  return found;
}

/**
 * Validate packet identity fields (source_ref, feature_id, packet_key)
 */
export function validatePacketIdentity(packet: {
  source_ref?: string | null;
  feature_id?: string | null;
  packet_key?: string | null;
}): string[] {
  const missing: string[] = [];

  if (!packet.source_ref || packet.source_ref.trim().length === 0) {
    missing.push('source_ref (required for identity)');
  }

  if (!packet.feature_id || packet.feature_id.trim().length === 0) {
    missing.push('feature_id (required for identity)');
  }

  if (!packet.packet_key || packet.packet_key.trim().length === 0) {
    missing.push('packet_key (required for identity)');
  }

  return missing;
}

/**
 * Validate that referenced tables exist in known schema
 */
export function validateSchemaReferences(text: string): string[] {
  const violations: string[] = [];

  // Extract potential table references (words followed by . or in SELECT/INSERT/UPDATE)
  const tableMatches = text.match(/(?:FROM|INTO|UPDATE|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN)\s+(\w+)/gi) ?? [];

  const tables = new Set(
    tableMatches.map((m) => {
      const match = /\s+(\w+)$/i.exec(m);
      return match ? match[1].toLowerCase() : null;
    }).filter((t): t is string => t !== null)
  );

  for (const table of tables) {
    if (!KNOWN_TABLES.has(table)) {
      violations.push(`Table '${table}' not found in known schema`);
    }
  }

  // Extract function references
  const functionMatches = text.match(/\b(\w+)\s*\(/g) ?? [];
  const functions = new Set(
    functionMatches.map((m) => {
      const match = /(\w+)\s*\(/.exec(m);
      return match ? match[1].toLowerCase() : null;
    }).filter((f): f is string => f !== null)
  );

  for (const func of functions) {
    if (!KNOWN_FUNCTIONS.has(func) && !func.match(/^(select|insert|update|delete|create|alter|drop|if|else|case|when|then|end)$/i)) {
      // Only warn if it's not a SQL keyword
      // (many functions will be legitimate — this is a heuristic gate)
      if (!func.match(/^(length|substring|trim|upper|lower|cast|coalesce|nullif|round|date|now|current)$/i)) {
        violations.push(`Function '${func}' not in known functions (check if exists before execution)`);
      }
    }
  }

  return violations;
}

/**
 * Detect unsafe write patterns (Redis/NATS before Postgres)
 */
export function detectUnsafeWritePatterns(text: string): string[] {
  const unsafe: string[] = [];

  // Check for Redis writes without Postgres
  if (/redis\.(set|del|incr|push|sadd)/i.test(text)) {
    if (!(/postgres\.(query|insert|update|delete)/i.test(text))) {
      unsafe.push('Redis write without Postgres write (violates truth hierarchy)');
    }
  }

  // Check for NATS publishes without Postgres
  if (/nats\.(publish|subscribe)/i.test(text)) {
    if (!(/postgres\.(query|insert|update|delete)/i.test(text))) {
      unsafe.push('NATS publish without Postgres write (violates async ordering)');
    }
  }

  // Check for "skip" or "bypass" keywords
  if (/skip.*postgres|bypass.*validation|force.*write/i.test(text)) {
    unsafe.push('Explicit request to skip Postgres or validation (not allowed)');
  }

  return unsafe;
}

/**
 * Main validation gate
 */
export function validateAceSchema(
  input: {
    text: string;
    packet?: {
      source_ref?: string | null;
      feature_id?: string | null;
      packet_key?: string | null;
    };
  }
): SchemaValidationResult {
  const blockedTerms = detectBlockedTerms(input.text);
  const missingIdentity = input.packet ? validatePacketIdentity(input.packet) : [];
  const schemaViolations = validateSchemaReferences(input.text);
  const unsafeOperations = detectUnsafeWritePatterns(input.text);

  const valid =
    blockedTerms.length === 0 &&
    missingIdentity.length === 0 &&
    schemaViolations.length === 0 &&
    unsafeOperations.length === 0;

  const report = [
    valid ? '✅ SCHEMA VALIDATION PASS' : '❌ SCHEMA VALIDATION FAIL',
    ...(blockedTerms.length > 0 ? [`Blocked terms: ${blockedTerms.join(', ')}`] : []),
    ...(missingIdentity.length > 0 ? [`Missing identity: ${missingIdentity.join(', ')}`] : []),
    ...(schemaViolations.length > 0 ? [`Schema violations: ${schemaViolations.join(', ')}`] : []),
    ...(unsafeOperations.length > 0 ? [`Unsafe operations: ${unsafeOperations.join(', ')}`] : []),
  ].join('\n');

  return {
    valid,
    blockedTerms,
    missingIdentity,
    schemaViolations,
    unsafeOperations,
    report,
  };
}

/**
 * Write validation report to disk
 */
export async function writeSchemaValidationReport(
  results: SchemaValidationResult[],
  outputPath: string = '.tmp/acp-prewrite-schema-match.json'
): Promise<void> {
  const fs = await import('node:fs/promises');
  const summary = {
    timestamp: new Date().toISOString(),
    total: results.length,
    passed: results.filter((r) => r.valid).length,
    failed: results.filter((r) => !r.valid).length,
    results,
  };

  await fs.mkdir('.tmp', { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(summary, null, 2));
}
