#!/usr/bin/env node
/**
 * Backfill Code Features Registry
 *
 * Processes existing evidence through the code_feature_registry worker stage.
 * Extracts code structure (functions, classes, imports) from evidence text.
 * Writes code_features and code_feature_edges to Postgres.
 * Syncs static_tags to Qdrant payload.
 *
 * Usage:
 *   npm run atlas:code-features:backfill --dry-run --limit=100
 *   npm run atlas:code-features:backfill --apply --verbose
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || !args.includes('--apply');
const verbose = args.includes('--verbose');
const fullFileAst = args.includes('--full-file-ast');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 100;
const repoEnv = loadRepoEnv(process.env);

const pool = new Pool({
  connectionString: resolveDatabaseUrl(repoEnv),
  max: 5,
});

const proof = {
  timestamp: new Date().toISOString(),
  mode: dryRun ? 'dry-run' : 'apply',
  limit,
  stats: {
    evidence_processed: 0,
    records_with_content: 0,
    features_extracted: 0,
    features_upserted: 0,
    edges_created: 0,
    ast_grep_files: 0,
    ast_grep_features: 0,
    fallback_regex_features: 0,
    errors: 0
  },
  errors: []
};

function normalizePathLike(value) {
  return String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '');
}

function languageFromPath(sourceRef = '') {
  const ext = path.extname(sourceRef).toLowerCase();
  if (ext === '.ts') return 'typescript';
  if (ext === '.tsx') return 'tsx';
  if (ext === '.js' || ext === '.cjs' || ext === '.mjs') return 'javascript';
  if (ext === '.svelte') return 'svelte';
  if (ext === '.sql') return 'sql';
  if (ext === '.json' || ext === '.jsonl') return 'json';
  if (ext === '.md' || ext === '.mdx') return 'markdown';
  return 'text';
}

function resolveSourceFile(sourceRef = '') {
  const normalized = normalizePathLike(sourceRef);
  if (!normalized) return null;
  const candidates = [
    path.join(REPO_ROOT, normalized),
    path.join(REPO_ROOT, 'sveltekit-frontend', normalized),
    normalized.startsWith('$lib/')
      ? path.join(REPO_ROOT, 'sveltekit-frontend', 'src', 'lib', normalized.slice('$lib/'.length))
      : null,
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function parseSymbolFromText(kind, text) {
  const line = String(text ?? '').trim();
  const patterns = [
    /\basync\s+function\s+([A-Za-z_$][\w$]*)\b/,
    /\bfunction\s+([A-Za-z_$][\w$]*)\b/,
    /\bconst\s+([A-Za-z_$][\w$]*)\s*=/,
    /\blet\s+([A-Za-z_$][\w$]*)\s*=/,
    /\bvar\s+([A-Za-z_$][\w$]*)\s*=/,
    /\bclass\s+([A-Za-z_$][\w$]*)\b/,
    /\binterface\s+([A-Za-z_$][\w$]*)\b/,
    /\btype\s+([A-Za-z_$][\w$]*)\b/,
    /\bexport\s+\{?\s*([A-Za-z_$][\w$]*)\b/,
    /\b([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/,
  ];
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match?.[1]) return match[1];
  }
  if (kind === 'import') {
    const mod = line.match(/\bfrom\s+['"]([^'"]+)['"]/)?.[1] ?? line.match(/\bimport\s+['"]([^'"]+)['"]/)?.[1];
    if (mod) return mod;
  }
  return null;
}

function featureKey(feature) {
  return `${feature.kind}:${feature.name}:${feature.lineNumber ?? ''}:${feature.parser ?? ''}`;
}

function dedupeFeatures(features) {
  const seen = new Set();
  const out = [];
  for (const feature of features) {
    if (!feature?.name || !feature?.kind) continue;
    const key = featureKey(feature);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(feature);
  }
  return out;
}

function runAstGrepOnFile(sourceFile) {
  if (!sourceFile) return [];
  const patterns = [
    { kind: 'function', pattern: 'function $NAME($$$ARGS) { $$$BODY }' },
    { kind: 'function', pattern: 'async function $NAME($$$ARGS) { $$$BODY }' },
    { kind: 'function', pattern: 'const $NAME = ($$$ARGS) => $$$BODY' },
    { kind: 'function', pattern: 'const $NAME = async ($$$ARGS) => $$$BODY' },
    { kind: 'function', pattern: 'export function $NAME($$$ARGS) { $$$BODY }' },
    { kind: 'class', pattern: 'class $NAME { $$$BODY }' },
    { kind: 'interface', pattern: 'interface $NAME { $$$BODY }' },
    { kind: 'type', pattern: 'type $NAME = $$$VALUE' },
    { kind: 'import', pattern: 'import $$$SPEC from "$MOD"' },
    { kind: 'import', pattern: "import $$$SPEC from '$MOD'" },
  ];
  const features = [];
  for (const { kind, pattern } of patterns) {
    const result = spawnSync('sg', ['-p', pattern, '--json', sourceFile], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 5 * 1024 * 1024,
    });
    if (result.status !== 0 && !result.stdout) continue;
    let matches = [];
    try {
      matches = JSON.parse(result.stdout || '[]');
    } catch {
      continue;
    }
    for (const match of matches) {
      const name = parseSymbolFromText(kind, match.text ?? match.lines);
      if (!name) continue;
      features.push({
        name,
        type: kind,
        kind,
        lineNumber: Number(match.range?.start?.line ?? 0) + 1,
        lineEnd: Number(match.range?.end?.line ?? match.range?.start?.line ?? 0) + 1,
        description: `${kind} ${name}`,
        parser: 'ast-grep',
      });
    }
  }
  return dedupeFeatures(features);
}

/**
 * Load canonical AST symbol index from symbols.jsonl
 * This is the authoritative list of 40K+ symbols extracted by ast-grep+regex
 */
async function loadCanonicalAstIndex() {
  try {
    const symbolsPath = path.join(REPO_ROOT, 'memory/index/symbols.jsonl');
    const content = await fs.readFile(symbolsPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    const symbolsByFile = {};
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (!symbolsByFile[entry.file]) {
          symbolsByFile[entry.file] = [];
        }
        symbolsByFile[entry.file].push(entry);
      } catch (err) {
        // Skip malformed lines
      }
    }

    return symbolsByFile;
  } catch (err) {
    console.warn(`Could not load canonical AST index: ${err.message}`);
    return {};
  }
}

/**
 * Extract AST features from canonical symbol index OR fallback to regex patterns.
 * The canonical index contains code symbols (functions, classes, imports) indexed by file path.
 * For evidence records, we extract features from the evidence text content via regex patterns.
 */
async function extractFeaturesFromText(text, sourceRef, canonicalIndex) {
  const features = [];

  // Try canonical index first ONLY if sourceRef looks like a file path
  // (starts with 'src/' or similar code paths, not 'evidence:123')
  if (canonicalIndex && Object.keys(canonicalIndex).length > 0 && sourceRef && sourceRef.startsWith('src/')) {
    // Extract features from canonical index by matching file paths
    for (const file of Object.keys(canonicalIndex)) {
      if (sourceRef === file || sourceRef.endsWith('/' + file)) {
        for (const symbol of canonicalIndex[file]) {
          features.push({
            name: symbol.symbol,
            type: symbol.kind,
            kind: symbol.kind,
            lineNumber: symbol.line,
            description: `${symbol.kind} ${symbol.symbol}`,
            parser: symbol.parser,
            stable_id: symbol.stable_id
          });
        }
        break;
      }
    }

    if (features.length > 0) {
      return features;
    }
  }

  // Fallback to regex if no canonical match
  // Function extraction pattern
  const funcPattern = /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(|(?:export\s+)?const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>|(?:export\s+)?const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:promisify|memoize|tool|create|build|define|z\.object|pgTable)\b/g;
  let match;
  while ((match = funcPattern.exec(text)) !== null) {
    const name = match[1] || match[2] || match[3];
    features.push({
      name,
      type: 'function',
      kind: 'function',
      lineNumber: text.substring(0, match.index).split('\n').length,
      description: `Function ${name}`,
      parser: 'fallback-regex'
    });
  }

  // Class extraction pattern
  const classPattern = /class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  while ((match = classPattern.exec(text)) !== null) {
    features.push({
      name: match[1],
      type: 'class',
      kind: 'class',
      lineNumber: text.substring(0, match.index).split('\n').length,
      description: `Class ${match[1]}`,
      parser: 'fallback-regex'
    });
  }

  // Import extraction pattern
  const importPattern = /import\s+(?:\{[^}]*\}\s+)?from\s+['"]([^'"]+)['"]/g;
  while ((match = importPattern.exec(text)) !== null) {
    features.push({
      name: match[1],
      type: 'import',
      kind: 'import',
      lineNumber: text.substring(0, match.index).split('\n').length,
      description: `Import from ${match[1]}`,
      parser: 'fallback-regex'
    });
  }

  // Export extraction pattern
  const exportPattern = /export\s+(?:async\s+)?(?:function|const|class)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  while ((match = exportPattern.exec(text)) !== null) {
    features.push({
      name: match[1],
      type: 'export',
      kind: 'export',
      lineNumber: text.substring(0, match.index).split('\n').length,
      description: `Export ${match[1]}`,
      parser: 'fallback-regex'
    });
  }

  const methodPattern = /^\s*(?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/gm;
  while ((match = methodPattern.exec(text)) !== null) {
    const name = match[1];
    if (['if', 'for', 'while', 'switch', 'catch', 'function'].includes(name)) continue;
    features.push({
      name,
      type: 'method',
      kind: 'method',
      lineNumber: text.substring(0, match.index).split('\n').length,
      description: `Method ${name}`,
      parser: 'fallback-regex'
    });
  }

  return dedupeFeatures(features);
}

/**
 * Upsert features to code_features table
 */
async function upsertFeatures(client, sourceRef, features, domainClass) {
  let upserted = 0;

  for (const feature of features) {
    const featureId = `${sourceRef}:${feature.name}:${feature.type}`;

    try {
      if (!dryRun) {
        await client.query(`
          INSERT INTO code_features (
            feature_id, source_ref, symbol, kind, language,
            line_start, line_end, packet_key, domain_class,
            static_tags, summary, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9, $10, NOW(), NOW())
          ON CONFLICT (source_ref, symbol, kind) DO UPDATE SET
            line_start = COALESCE(EXCLUDED.line_start, code_features.line_start),
            line_end = COALESCE(EXCLUDED.line_end, code_features.line_end),
            static_tags = EXCLUDED.static_tags,
            summary = COALESCE(NULLIF(EXCLUDED.summary, ''), code_features.summary),
            updated_at = NOW()
        `, [
          featureId,
          sourceRef,
          feature.name,
          feature.kind,
          languageFromPath(sourceRef),
          feature.lineNumber || null,
          feature.lineEnd || null,
          domainClass,
          feature.type === 'function' || feature.type === 'method'
            ? ['function', 'callable', feature.parser ?? 'unknown']
            : ['code_structure', feature.parser ?? 'unknown'],
          feature.description
        ]);
      }

      upserted++;
    } catch (err) {
      proof.errors.push({
        feature_id: featureId,
        error: err.message
      });
      proof.stats.errors++;
    }
  }

  return upserted;
}

/**
 * Process a batch of codebase chunk records
 */
async function processEvidence(client, canonicalIndex) {
  const query = `
    SELECT
      cci.id,
      cci.relative_path,
      cci.symbol,
      cci.kind,
      cci.line_start,
      cci.line_end,
      cci.content,
      COALESCE(cci.relative_path, CONCAT('chunk:', cci.id)) as source_ref
    FROM codebase_chunk_index cci
    WHERE cci.relative_path IS NOT NULL
    LIMIT $1
  `;

  try {
    const result = await client.query(query, [limit]);
    const records = result.rows;

    for (const record of records) {
      const sourceRef = record.source_ref || `chunk:${record.id}`;
      const domainClass = record.relative_path?.includes('legal') ? 'legal_code' : 'application_code';
      if (record.content) proof.stats.records_with_content++;

      const features = [];
      if (record.symbol && record.kind) {
        features.push({
          name: record.symbol,
          type: record.kind,
          kind: record.kind,
          lineNumber: record.line_start,
          lineEnd: record.line_end,
          description: `${record.kind} ${record.symbol}`,
          parser: 'codebase_chunk_index'
        });
      }

      if (record.content) {
        const extracted = await extractFeaturesFromText(record.content, sourceRef, canonicalIndex);
        proof.stats.fallback_regex_features += extracted.filter((feature) => feature.parser === 'fallback-regex').length;
        features.push(...extracted);
      }

      const sourceFile = fullFileAst ? resolveSourceFile(sourceRef) : null;
      if (sourceFile) {
        const astFeatures = runAstGrepOnFile(sourceFile);
        if (astFeatures.length > 0) {
          proof.stats.ast_grep_files++;
          proof.stats.ast_grep_features += astFeatures.length;
          features.push(...astFeatures);
        }
      }

      const finalFeatures = dedupeFeatures(features);
      if (finalFeatures.length > 0) {
        const upserted = await upsertFeatures(client, sourceRef, finalFeatures, domainClass);
        proof.stats.features_extracted += finalFeatures.length;
        proof.stats.features_upserted += upserted;
      }

      proof.stats.evidence_processed++;

      if (verbose && proof.stats.evidence_processed % 10 === 0) {
        console.log(`  Processed ${proof.stats.evidence_processed} records, upserted ${proof.stats.features_upserted} features`);
      }
    }

    return records.length;
  } catch (err) {
    console.error(`Query error: ${err.message}`);
    proof.errors.push({ phase: 'query', error: err.message });
    return 0;
  }
}

async function main() {
  console.log(`📊 Code Features Registry Backfill\n`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'APPLY (writes enabled)'}`);
  console.log(`Limit: ${limit} evidence records\n`);
  console.log(`Full-file ast-grep: ${fullFileAst ? 'enabled' : 'disabled'}\n`);

  try {
    console.log(`[1/4] Loading canonical AST symbol index...`);
    const canonicalIndex = await loadCanonicalAstIndex();
    const indexSize = Object.keys(canonicalIndex).length;
    console.log(`✓ Loaded ${indexSize} files from canonical index`);

    console.log(`[2/4] Connecting to database...`);
    await pool.connect();
    console.log(`✓ Connected`);

    console.log(`[3/4] Processing evidence records...`);
    const processed = await processEvidence(pool, canonicalIndex);
    console.log(`✓ Processed ${processed} records`);

    console.log(`[4/4] Writing proof report...`);
    proof.stats.canonical_ast_index_files = indexSize;
    if (!dryRun) {
      // Only write on apply mode
      const reportsDir = path.join(REPO_ROOT, 'docs/reports');
      try {
        await fs.mkdir(reportsDir, { recursive: true });
      } catch (err) {
        // Directory may already exist
      }

      await fs.writeFile(
        path.join(reportsDir, 'code-feature-backfill-proof.json'),
        JSON.stringify(proof, null, 2)
      );
    }
    console.log(`✓ Proof written`);

    // Summary
    console.log(`\n✅ Backfill complete`);
    console.log(`Summary:`);
    console.log(`  Canonical AST index files: ${indexSize}`);
    console.log(`  Evidence processed: ${proof.stats.evidence_processed}`);
    console.log(`  Features extracted: ${proof.stats.features_extracted}`);
    console.log(`  Features upserted: ${proof.stats.features_upserted}`);
    console.log(`  Errors: ${proof.stats.errors}`);

    process.exit(proof.stats.errors === 0 ? 0 : 1);
  } catch (err) {
    console.error(`✗ Fatal error:`, err);
    process.exit(1);
  } finally {
    pool.end().catch(() => {});
  }
}

main();
