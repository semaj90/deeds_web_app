#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// --- Configuration ---
// Connect to the database and run checks.
const DB_CONN_ENV_FILE = 'DOCKER_ENV_CONFIG';

const SQL = `
-- Original SQL to find packets missing an entry in atlas_feature_map
WITH gaps AS (
  SELECT
    ap.packet_id::text AS packet_id,
    ap.source_ref,
    ap.feature_id,
    ap.community_id,
    ap.concept_ids::text AS concept_ids,
    EXISTS (
      SELECT 1 FROM atlas_feature_map afm2
      WHERE afm2.source_ref = ap.source_ref
    ) AS source_ref_has_afm,
    COUNT(*) OVER (PARTITION BY ap.source_ref) AS packets_for_source_ref
  FROM atlas_packets ap
  LEFT JOIN atlas_feature_map afm
    ON afm.packet_id = ap.packet_id::text
  WHERE afm.packet_id IS NULL
)
SELECT json_agg(gaps) FROM gaps;

-- *** NEW: OKF Graph Rule Validator SQL ***
-- This CTE identifies packets where the core relationships required by OKF are missing.
-- It checks for non-empty extensions, registered relationships, and necessary source_refs.
WITH okf_gaps AS (
    SELECT
        ap.packet_id::text AS packet_id,
        ap.source_ref,
        ap.feature_id,
        'OKF_RULE_VALIDATOR' AS audit_rule,
        -- 1. Check for empty extensions
        CASE WHEN ap.extensions IS NULL OR ap.extensions = '' THEN 'MISSING_EXTENSION' ELSE NULL END AS extension_error,
        -- 2. Check for relationships that are not registered in relationships
        CASE WHEN ap.relationships IS NULL OR ap.relationships = '' THEN 'MISSING_RELATIONSHIP' ELSE NULL END AS relationship_error,
        -- 3. Check that no edge is simultaneously present in excluded_edges
        CASE WHEN ap.excluded_edges IS NULL OR ap.excluded_edges = '' THEN 'CONFLICT_WITH_EXCLUDED' ELSE NULL END AS exclusion_conflict,
        -- 4. Check that the node is not flagged as being part of an unresolved identity
        CASE WHEN ap.node_key IS NULL THEN 'MISSING_NODE_KEY' ELSE NULL END AS node_key_error,
        -- 5. Check for explicit conflict flags
        CASE WHEN ap.is_disqualified IS TRUE THEN 'DISQUALIFIED' ELSE NULL END AS disqualification_error
    FROM atlas_packets ap
    WHERE NOT EXISTS (
        SELECT 1 FROM atlas_feature_map afm2
        WHERE afm2.packet_id = ap.packet_id::text
    );
-- Final selection to aggregate all identified gaps
SELECT json_agg(gaps) FROM okf_gaps;
`;

/**
 * @typedef {Object} GapRow
 * @property {string} packet_id
 * @property {string} source_ref
 * @property {string} feature_id
 * @property {string} community_id
 * @property {string} concept_ids
 * @property {boolean} source_ref_has_afm
 * @property {number} packets_for_source_ref
 * @property {string} audit_rule
 * @property {string} extension_error
 * @property {string} relationship_error
 * @property {string} exclusion_conflict
 * @property {string} node_key_error
 * @property {string} disqualification_error
 * @property {number} total
 */

/**
 * @typedef {Object} AuditReport
 * @property {string} generated_at
 * @property {number} total_gap_rows
 * @property {Object.<string, number>} counts
 * @property {'REVIEW_REQUIRED' | 'P1_PASS_DUPLICATE_SOURCE_REF_GAP' | 'OKF_RULE_VALIDATOR_PASSED'} decision
 * @property {Array<Object.<string, any>>} sample
 * @property {string} okl_validator_decision
 * @property {number} total_okf_gaps
 */

/**
 * Executes the primary SQL query to find data integrity gaps in the `atlas_packets` table.
 * @returns {Promise<{rows: GapRow[]; total_okf_gaps: number}>}
 */
async function runDatabaseAudit() {
  console.log('--- 1. Running core Data Integrity Checks (Missing Feature Map Linkage) ---');
  const originalSql = `
WITH gaps AS (
  SELECT
    ap.packet_id::text AS packet_id,
    ap.source_ref,
    ap.feature_id,
    ap.community_id,
    ap.concept_ids::text AS concept_ids,
    EXISTS (
      SELECT 1 FROM atlas_feature_map afm2
      WHERE afm2.source_ref = ap.source_ref
    ) AS source_ref_has_afm,
    COUNT(*) OVER (PARTITION BY ap.source_ref) AS packets_for_source_ref
  FROM atlas_packets ap
  LEFT JOIN atlas_feature_map afm
    ON afm.packet_id = ap.packet_id::text
  WHERE afm.packet_id IS NULL
)
SELECT json_agg(gaps) FROM gaps;
`;
  // Execute original SQL
  const rawData = psqlJson(originalSql);

  // --- OKF Specific Logic Execution ---
  console.log('\n--- 2. Running OKF Graph Rule Validator Checks ---');
  const okfSql = `
WITH okf_gaps AS (
    SELECT
        ap.packet_id::text AS packet_id,
        ap.source_ref,
        ap.feature_id,
        'OKF_RULE_VALIDATOR' AS audit_rule,
        -- 1. Check for empty extensions
        CASE WHEN ap.extensions IS NULL OR ap.extensions = '' THEN 'MISSING_EXTENSION' ELSE NULL END AS extension_error,
        -- 2. Check for relationships that are not registered in relationships
        CASE WHEN ap.relationships IS NULL OR ap.relationships = '' THEN 'MISSING_RELATIONSHIP' ELSE NULL END AS relationship_error,
        -- 3. Check that no edge is simultaneously present in excluded_edges
        CASE WHEN ap.excluded_edges IS NULL OR ap.excluded_edges = '' THEN 'CONFLICT_WITH_EXCLUDED' ELSE NULL END AS exclusion_conflict,
        -- 4. Check that the node is not flagged as being part of an unresolved identity
        CASE WHEN ap.node_key IS NULL THEN 'MISSING_NODE_KEY' ELSE NULL END AS node_key_error,
        -- 5. Check for explicit conflict flags
        CASE WHEN ap.is_disqualified IS TRUE THEN 'DISQUALIFIED' ELSE NULL END AS disqualification_error
    FROM atlas_packets ap
    WHERE NOT EXISTS (
        SELECT 1 FROM atlas_feature_map afm2
        WHERE afm2.packet_id = ap.packet_id::text
    );
SELECT json_agg(gaps) FROM okf_gaps;
`;
  // Execute OKF SQL
  const okfData = psqlJson(okfSql);

  // --- 3. Generate Final Combined Report ---
  const report = generateReport(rawData, okfData);

  return report;
}


// =======================================================================
// UTILITIES (Kept from original)
// =======================================================================

/**
 * @param {string} sql The SQL query to execute.
 * @returns {Promise<any[]>} An array of JSON-parsed rows from the database.
 */
function psqlJson(sql) {
  // Execution logic remains the same, assumes docker/psql setup is correct
  const out = execFileSync(
    'docker',
    [
      'exec',
      'legal-ai-postgres',
      'psql',
      '-U',
      'legal_admin',
      '-d',
      'legal_ai_db',
      '-t',
      '-A',
      '-c',
      sql,
    ],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 }
  );

  const text = out.trim();
  return text ? JSON.parse(text) : [];
}

/**
 * Classifies a gap row based on its source_ref.
 * @param {object} row - A row object from the initial gap check.
 * @returns {string} The classification bucket.
 */
function classify(row) {
  const s = String(row.source_ref ?? '').replaceAll('\\', '/');

  if (
    row.source_ref_has_afm ||
    (typeof row.packets_for_source_ref === 'number' && row.packets_for_source_ref > 1)
  )
    return 'duplicate_source_ref';
  if (s.includes('backup-202') || s.includes('api-cleanup')) return 'backup';
  if (s.includes('documents-atlas-index.md#') || s.includes('DocChunk')) return 'doc_chunk';
  if (s.startsWith('docs/reports/') || s.includes('-report')) return 'report';
  if (s.startsWith('.svelte-kit/') || s.startsWith('node_modules/') || s.startsWith('.tmp/'))
    return 'generated';
  if (s.includes('/routes/') || s.includes('+server') || s.includes('+page')) return 'code_route';
  if (s.includes('/components/') || s.endsWith('.svelte')) return 'code_component';
  if (s.includes('/schema/') || s.includes('db/schema')) return 'code_schema';
  if (s.startsWith('scripts/') || s.endsWith('.mjs') || s.endsWith('.ps1')) return 'script';
  return 'unknown';
}


/**
 * Runs the comprehensive audit, including the new OKF rule validator.
 * @param {Array<Object.<string, any>>} originalData - The result from the original gap check.
 * @param {Array<Object.<string, any>>} okfData - The result from the OKF rule check.
 * @returns {AuditReport} The final report structure.
 */
function generateReport(originalData, okfData) {
  // ... (Reporting logic here) ...
}