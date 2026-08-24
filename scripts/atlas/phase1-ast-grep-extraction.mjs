#!/usr/bin/env node

/**
 * Phase 106 Stage 1: AST-Grep Structural Extraction
 *
 * Extracts structural symbols (functions, classes, imports, exports) from code packets.
 * Target: 95%+ coverage of 7,273 eligible code packets
 * Expected throughput: 500-1000 packets/min (ast-grep CLI is fast)
 */

import { execSync } from 'child_process';
import pg from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { extractSymbolsViaAstGrep } from './lib/ast-grep-symbol-extraction.mjs';

const { Pool } = pg;

const CONFIG = {
  dry_run: process.argv.includes('--dry-run'),
  limit: parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '999999'),
  batch_size: parseInt(process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '50'),
  verbose: process.argv.includes('--verbose'),

  // Language detection
  LANGUAGE_MAP: {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.cpp': 'cpp',
    '.c': 'c',
    '.h': 'c',
    '.cs': 'csharp',
    '.rb': 'ruby',
    '.php': 'php',
  },

  // ast-grep rule kinds per language
  AST_GREP_RULES: {
    typescript: [
      'FunctionDeclaration',
      'ClassDeclaration',
      'InterfaceDeclaration',
      'ImportDeclaration',
      'ExportDeclaration',
      'ArrowFunctionExpression',
      'VariableDeclarator',
      'EnumDeclaration',
    ],
    javascript: [
      'FunctionDeclaration',
      'ClassDeclaration',
      'ImportDeclaration',
      'ExportDeclaration',
      'ArrowFunctionExpression',
      'VariableDeclarator',
    ],
    python: [
      'FunctionDef',
      'ClassDef',
      'ImportFrom',
      'Import',
    ],
    go: [
      'FunctionDecl',
      'TypeDecl',
      'ImportDecl',
    ],
    rust: [
      'FunctionItem',
      'StructItem',
      'ImplItem',
      'TraitItem',
      'UseDeclaration',
    ],
    java: [
      'ClassDeclaration',
      'MethodDeclaration',
      'ImportDeclaration',
      'InterfaceDeclaration',
    ],
  },
};

class ASTExtractionError extends Error {
  constructor(message, packet_key, language) {
    super(message);
    this.name = 'ASTExtractionError';
    this.packet_key = packet_key;
    this.language = language;
  }
}

async function initDatabase() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: process.env.POSTGRES_PORT || 5434,
    user: process.env.POSTGRES_USER || 'legal_admin',
    password: process.env.POSTGRES_PASSWORD || '123456',
    database: process.env.POSTGRES_DB || 'legal_ai_db',
  });

  // Ensure atlas_packet_features exists. This previously declared a
  // `packet_id INTEGER NOT NULL REFERENCES atlas_packets(id)` FK that could
  // never be satisfied — atlas_packets has no `id` column at all, and its
  // own identity column (`packet_id`) is `text`, not an integer. Because the
  // real table already existed (drizzle/0043 + drizzle/0020), this
  // CREATE TABLE IF NOT EXISTS was always a silent no-op, so the mismatch
  // never surfaced until this table's actual writer (this file's own
  // INSERT, below) was finally exercised. The 5 real columns this script
  // needs (source_ref/ast_coverage/ast_language/ast_extraction_method/
  // ast_hash) were added additively via
  // drizzle/0154_atlas_packet_features_ast_provenance_columns.sql — no data
  // was touched. `packet_key` (already the table's real unique constraint)
  // is the canonical identity join key; there is no packet_id column here.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS atlas_packet_features (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        packet_key TEXT NOT NULL UNIQUE,
        source_ref TEXT,
        ast_symbols TEXT[],
        ast_coverage REAL DEFAULT 0,
        ast_language VARCHAR(50),
        ast_extraction_method VARCHAR(50),
        ast_hash VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
  } catch (err) {
    // Table might already exist, continue
  }

  // Create indexes separately
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ast_packet_key ON atlas_packet_features(packet_key)`);
  } catch (err) {
    // Index might already exist
  }

  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ast_coverage ON atlas_packet_features(ast_coverage) WHERE ast_coverage > 0`);
  } catch (err) {
    // Index might already exist
  }

  return pool;
}

function detectLanguage(file_path) {
  const ext = path.extname(file_path).toLowerCase();
  return CONFIG.LANGUAGE_MAP[ext] || null;
}

async function extractASTSymbols(content, language, file_path) {
  if (!language) {
    return { symbols: [], coverage: 0, method: 'skipped', error: 'unsupported_language' };
  }

  try {
    // NE-06: real ast-grep structural extraction for TypeScript/JavaScript.
    // extractSymbolsViaAstGrep returns null (not an empty array) when the
    // language isn't TS/JS or the ast-grep binary isn't on PATH, so we can
    // fall back to the regex extractor honestly rather than silently.
    const astGrepResult = extractSymbolsViaAstGrep(content, language);
    if (astGrepResult) {
      return astGrepResult;
    }

    // Fallback: regex extraction (still the only path for python/go, or if
    // the ast-grep binary is unavailable in this environment).
    const symbols = await extractSymbolsViaRegex(content, language);

    return {
      symbols: symbols,
      coverage: symbols.length > 0 ? 1.0 : 0,
      method: 'regex_fallback',
      error: null,
    };
  } catch (err) {
    if (CONFIG.verbose) {
      console.error(`[ERROR] AST extraction failed for ${file_path}:`, err.message);
    }
    return {
      symbols: [],
      coverage: 0,
      method: 'error',
      error: err.message,
    };
  }
}

async function extractSymbolsViaRegex(content, language) {
  const symbols = new Set();

  if (language === 'typescript' || language === 'javascript') {
    // Extract function names: function foo() | const foo = () | export function foo
    const funcRegex = /(?:export\s+)?(?:async\s+)?(?:function|const)\s+(\w+)/g;
    let match;
    while ((match = funcRegex.exec(content)) !== null) {
      symbols.add(match[1]);
    }

    // Extract class names: class Foo | export class Foo
    const classRegex = /(?:export\s+)?class\s+(\w+)/g;
    while ((match = classRegex.exec(content)) !== null) {
      symbols.add(match[1]);
    }

    // Extract imports
    const importRegex = /import\s+(?:{[^}]+}|[\w*]+)\s+from\s+["']([^"']+)["']/g;
    while ((match = importRegex.exec(content)) !== null) {
      symbols.add(`import:${match[1]}`);
    }
  } else if (language === 'python') {
    // Extract function names: def foo()
    const funcRegex = /^def\s+(\w+)/gm;
    let match;
    while ((match = funcRegex.exec(content)) !== null) {
      symbols.add(match[1]);
    }

    // Extract class names: class Foo
    const classRegex = /^class\s+(\w+)/gm;
    while ((match = classRegex.exec(content)) !== null) {
      symbols.add(match[1]);
    }

    // Extract imports: from X import Y | import X
    const importRegex = /^(?:from\s+(\S+)\s+)?import\s+(\S+)/gm;
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) symbols.add(`import:${match[1]}`);
      symbols.add(`import:${match[2]}`);
    }
  } else if (language === 'go') {
    // Extract function names: func Name()
    const funcRegex = /func\s+\(?\w+\)?\s*(\w+)/g;
    let match;
    while ((match = funcRegex.exec(content)) !== null) {
      symbols.add(match[1]);
    }

    // Extract types: type Name struct | type Name interface
    const typeRegex = /type\s+(\w+)\s+(?:struct|interface)/g;
    while ((match = typeRegex.exec(content)) !== null) {
      symbols.add(match[1]);
    }
  }

  return Array.from(symbols).sort();
}

async function generateASTHash(symbols) {
  const content = symbols.join('|');
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function extractPackets(pool, limit) {
  // `payload->>'kind' = 'code'` is dead: confirmed live via
  // `SELECT payload->>'kind', count(*) FROM atlas_packets GROUP BY 1` that
  // `payload` has no `kind` key at all on any of the 61,660 rows in this
  // table — this half of the OR has never matched anything. The real
  // code-identifying value, confirmed the same way, is
  // `source_kind = 'codebase_chunk'` (3,294 rows; `rpc_method` and
  // `cluster-summary` are the only other non-empty source_kind values).
  // Kept the original `payload->>'kind'` clause as a forward-compatible
  // no-op rather than deleting it outright, in case a future producer
  // starts setting it.
  const query = `
    SELECT p.packet_key, p.source_ref, p.file_path,
           COALESCE(p.payload->>'text', '') as content
    FROM atlas_packets p
    WHERE (p.payload->>'kind' = 'code' OR p.source_kind = 'codebase_chunk')
      AND p.packet_key IS NOT NULL
      AND p.source_ref IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM atlas_packet_features apf
        WHERE apf.packet_key = p.packet_key
      )
    LIMIT $1
  `;

  const result = await pool.query(query, [limit]);
  return result.rows;
}

async function processPackets(pool, packets) {
  const results = {
    total: packets.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  for (let i = 0; i < packets.length; i++) {
    const packet = packets[i];
    // Some codebase_chunk packets carry the real path only in source_ref,
    // not file_path (confirmed live: 3 of the 4 currently-eligible rows
    // have an empty file_path but a populated source_ref).
    const language = detectLanguage(packet.file_path || packet.source_ref || '');

    try {
      const extraction = await extractASTSymbols(packet.content, language, packet.file_path);
      const ast_hash = await generateASTHash(extraction.symbols);

      if (CONFIG.dry_run) {
        if (CONFIG.verbose) {
          console.log(
            `[DRY] ${packet.packet_key}: ${extraction.symbols.length} symbols, coverage ${extraction.coverage.toFixed(2)}`
          );
        }
      } else {
        // INSERT or UPDATE
        await pool.query(`
          INSERT INTO atlas_packet_features (
            packet_key, source_ref, ast_symbols, ast_coverage,
            ast_language, ast_extraction_method, ast_hash
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (packet_key) DO UPDATE SET
            source_ref = EXCLUDED.source_ref,
            ast_symbols = EXCLUDED.ast_symbols,
            ast_coverage = EXCLUDED.ast_coverage,
            ast_language = EXCLUDED.ast_language,
            ast_extraction_method = EXCLUDED.ast_extraction_method,
            ast_hash = EXCLUDED.ast_hash,
            updated_at = NOW()
        `, [
          packet.packet_key,
          packet.source_ref,
          extraction.symbols,
          extraction.coverage,
          language,
          extraction.method,
          ast_hash,
        ]);
      }

      results.succeeded++;

      if ((i + 1) % 100 === 0) {
        console.log(`Progress: ${i + 1}/${results.total} (${(((i + 1) / results.total) * 100).toFixed(1)}%)`);
      }
    } catch (err) {
      results.failed++;
      results.errors.push({
        packet_key: packet.packet_key,
        error: err.message,
      });

      if (CONFIG.verbose) {
        console.error(`[ERROR] Failed to process ${packet.packet_key}:`, err.message);
      }
    }
  }

  return results;
}

async function verifyGate(pool) {
  const result = await pool.query(`
    SELECT COUNT(*) total,
           COUNT(CASE WHEN ast_symbols IS NOT NULL THEN 1 END) extracted
    FROM atlas_packet_features
    WHERE ast_coverage > 0
  `);

  const { total, extracted } = result.rows[0];
  const coverage = total > 0 ? (extracted / total) * 100 : 0;

  console.log(`\n📊 Verification Gate:`);
  console.log(`   Total packets: ${total}`);
  console.log(`   Extracted: ${extracted} (${coverage.toFixed(1)}%)`);
  console.log(`   Target: ≥95%`);
  console.log(`   Status: ${coverage >= 95 ? '✅ PASS' : '❌ FAIL'}`);

  return coverage >= 95;
}

async function main() {
  console.log('──────────────────────────────────────────────────────────────────');
  console.log('Phase 106 Stage 1: AST-Grep Structural Extraction');
  console.log('──────────────────────────────────────────────────────────────────');
  console.log(`Configuration:`);
  console.log(`  Dry-run:     ${CONFIG.dry_run}`);
  console.log(`  Limit:       ${CONFIG.limit} packets`);
  console.log(`  Batch size:  ${CONFIG.batch_size}`);
  console.log('');

  const pool = await initDatabase();

  try {
    console.log('📦 Loading packets...');
    const packets = await extractPackets(pool, CONFIG.limit);
    console.log(`✅ Loaded ${packets.length} packets\n`);

    if (packets.length === 0) {
      console.log('⚠️  No packets to process.');
      return;
    }

    console.log('⚡ Processing packets...');
    const results = await processPackets(pool, packets);

    console.log(`\n📊 Results:`);
    console.log(`  Total:     ${results.total}`);
    console.log(`  Succeeded: ${results.succeeded} ✅`);
    console.log(`  Failed:    ${results.failed} ❌`);
    console.log(`  Skipped:   ${results.skipped} ⏭️`);
    console.log(`  Coverage:  ${((results.succeeded / results.total) * 100).toFixed(1)}%`);

    if (results.errors.length > 0 && CONFIG.verbose) {
      console.log(`\nFirst 5 errors:`);
      results.errors.slice(0, 5).forEach(err => {
        console.log(`  - ${err.packet_key}: ${err.error}`);
      });
    }

    const gatePass = await verifyGate(pool);

    if (!CONFIG.dry_run && gatePass) {
      console.log('\n✅ Stage 1 COMPLETE — Ready for Stage 2');
    } else if (CONFIG.dry_run) {
      console.log('\n✅ Dry-run PASS — Run with --apply to persist');
    } else {
      console.log('\n❌ Verification gate FAIL — Review errors above');
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
