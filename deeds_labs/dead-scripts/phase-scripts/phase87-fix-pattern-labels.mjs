#!/usr/bin/env node
/**
 * Phase 87: Fix Pattern Labels in Knowledge Graph
 *
 * Replaces "undefined" pattern labels with deterministic regex-based labels.
 * This is CRITICAL for RAG quality - undefined patterns poison the graph.
 *
 * Usage:
 *   node scripts/phase87-fix-pattern-labels.mjs
 */

import pg from 'pg';

const PG_CONFIG = {
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? '5434'),
  database: process.env.PGDATABASE ?? 'legal',
  user: process.env.PGUSER ?? 'user',
  password: process.env.PGPASSWORD ?? 'pass'
};

// Deterministic pattern rules for TS error codes
const PATTERN_RULES = {
  TS1005: [
    { regex: /import\s*{\s*\w+\s+\w+/, label: 'missing-comma-import' },
    { regex: /class.*{\s*\w+:\s*\w+\s+\w+/, label: 'missing-comma-class' },
    { regex: /;\s*from\s*'/, label: 'semicolon-before-from' },
    { regex: /,\s*from\s*'/, label: 'comma-before-from' },
    { regex: /<\w+,\s*\w+>/, label: 'colon-in-generic' },
    { regex: /export\s*{\s*\w+\s+\w+/, label: 'missing-comma-export' },
    { regex: /\]\s*:\s*\w+\s+\w+/, label: 'missing-comma-array-type' },
    { regex: /}\s*;/, label: 'extra-semicolon' }
  ],
  TS1128: [
    { regex: /}\s*{/, label: 'glued-blocks' },
    { regex: /const.*=.*const/, label: 'missing-semicolon-decl' },
    { regex: /let.*=.*let/, label: 'missing-semicolon-let' },
    { regex: /;\s*const\s*{/, label: 'destructure-after-import' },
    { regex: /import.*}\s*{/, label: 'glued-imports' }
  ],
  TS1109: [
    { regex: /\/[^/\n]*\n/, label: 'unterminated-regex' },
    { regex: /=\s*\n/, label: 'trailing-assignment' },
    { regex: /:\s*\n/, label: 'trailing-colon' },
    { regex: /\(\s*\n/, label: 'unclosed-paren' }
  ],
  TS1434: [
    { regex: /\|\s*\n/, label: 'trailing-union' },
    { regex: /&\s*\n/, label: 'trailing-intersection' }
  ],
  TS1131: [
    { regex: /:\s*{\s*\n/, label: 'unclosed-object-type' }
  ]
};

async function detectPatternLabel(errorCode, fileContent, errorMessage) {
  const rules = PATTERN_RULES[errorCode];
  if (!rules) return `${errorCode}-unknown`;

  // Try to match each pattern
  for (const { regex, label } of rules) {
    if (regex.test(fileContent || '')) {
      return label;
    }
  }

  // Fallback: extract from error message
  if (errorMessage) {
    const msg = errorMessage.toLowerCase();
    if (msg.includes(',')) return 'missing-comma';
    if (msg.includes(';')) return 'missing-semicolon';
    if (msg.includes('}')) return 'missing-brace';
    if (msg.includes(')')) return 'missing-paren';
    if (msg.includes('>')) return 'missing-angle';
  }

  return `${errorCode}-syntax`;
}

async function main() {
  console.log('🔧 Phase 87: Fix Pattern Labels in Knowledge Graph');
  console.log('=' .repeat(80));
  console.log(`📊 PostgreSQL: postgresql://${PG_CONFIG.user}@${PG_CONFIG.host}:${PG_CONFIG.port}/${PG_CONFIG.database}\n`);

  const pool = new pg.Pool(PG_CONFIG);

  try {
    // 1. Find all undefined patterns - using correct column names
    console.log('🔍 Step 1: Finding undefined pattern labels...');

    // First, let's see what patterns exist
    const { rows: samplePatterns } = await pool.query(`
      SELECT id, source_type, source_name, target_type, target_name, relationship, confidence
      FROM knowledge_graph
      WHERE relationship = 'matches_pattern'
      LIMIT 10
    `);

    if (samplePatterns.length === 0) {
      console.log('   ⚠️ No patterns in knowledge_graph yet.');
      console.log('   Creating patterns from ts_errors...\n');

      // Create pattern entries for high-impact errors
      const { rows: errors } = await pool.query(`
        SELECT id, error_code, error_message, file_path
        FROM ts_errors
        WHERE error_code IN ('TS1005', 'TS1128', 'TS1109')
        ORDER BY impact_score DESC
        LIMIT 100
      `);

      console.log(`   Found ${errors.length} errors to create patterns for\n`);

      const fs = await import('fs/promises');
      const path = await import('path');
      const rootDir = process.cwd();

      let created = 0;
      const patternCounts = {};

      for (const error of errors) {
        const filePath = path.join(rootDir, error.file_path);
        let fileContent = '';

        try {
          fileContent = await fs.readFile(filePath, 'utf-8');
        } catch {
          // File might not exist
        }

        const label = await detectPatternLabel(error.error_code, fileContent, error.error_message);
        patternCounts[label] = (patternCounts[label] || 0) + 1;

        // Insert pattern into knowledge_graph
        await pool.query(`
          INSERT INTO knowledge_graph (source_type, source_name, target_type, target_name, relationship, confidence, metadata)
          VALUES ('error', $1, 'pattern', $2, 'matches_pattern', 0.75, $3)
          ON CONFLICT DO NOTHING
        `, [
          `${error.error_code}:${error.file_path}`,
          label,
          JSON.stringify({ error_id: error.id, error_code: error.error_code, file_path: error.file_path })
        ]);

        created++;

        if (created % 25 === 0) {
          console.log(`   Progress: ${created}/${errors.length}`);
        }
      }

      console.log(`   ✅ Created ${created} pattern entries\n`);

      // Print pattern breakdown
      console.log('📊 Pattern breakdown:');
      const sortedPatterns = Object.entries(patternCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);

      for (const [label, count] of sortedPatterns) {
        console.log(`   - ${label}: ${count}`);
      }

      await pool.end();
      console.log('\n✅ Pattern labels created! Run phase86-autonomous-loop.mjs to test.\n');
      return;
    }

    console.log(`   Found ${samplePatterns.length} existing patterns`);
    console.log('   Sample:', samplePatterns[0]);

    console.log(`   Found ${undefinedPatterns.length} undefined patterns\n`);

    if (undefinedPatterns.length === 0) {
      console.log('✅ No undefined patterns found. Graph is clean!\n');
      await pool.end();
      return;
    }

    // 2. Read file contents for pattern detection
    console.log('📄 Step 2: Reading file contents for pattern detection...');
    const fs = await import('fs/promises');
    const path = await import('path');
    const rootDir = process.cwd();

    let updated = 0;
    const patternCounts = {};

    for (const entry of undefinedPatterns) {
      const filePath = path.join(rootDir, entry.file_path);
      let fileContent = '';

      try {
        fileContent = await fs.readFile(filePath, 'utf-8');
      } catch {
        // File might not exist, use error message only
      }

      const label = await detectPatternLabel(entry.error_code, fileContent, entry.error_message);
      patternCounts[label] = (patternCounts[label] || 0) + 1;

      // Update the knowledge graph
      await pool.query(`
        UPDATE knowledge_graph
        SET target_id = $1, confidence = 0.75
        WHERE id = $2
      `, [label, entry.id]);

      updated++;

      if (updated % 50 === 0) {
        console.log(`   Progress: ${updated}/${undefinedPatterns.length}`);
      }
    }

    console.log(`   ✅ Updated ${updated} pattern labels\n`);

    // 3. Print pattern breakdown
    console.log('📊 Step 3: Pattern breakdown:');
    const sortedPatterns = Object.entries(patternCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    for (const [label, count] of sortedPatterns) {
      console.log(`   - ${label}: ${count}`);
    }

    // 4. Verify the fix
    console.log('\n🔍 Step 4: Verification...');
    const { rows: remaining } = await pool.query(`
      SELECT COUNT(*) as count FROM knowledge_graph
      WHERE relationship = 'matches_pattern'
      AND (target_id = 'undefined' OR target_id IS NULL OR target_id = '')
    `);

    const { rows: fixed } = await pool.query(`
      SELECT target_id, COUNT(*) as count FROM knowledge_graph
      WHERE relationship = 'matches_pattern'
      AND target_id NOT IN ('undefined', '')
      AND target_id IS NOT NULL
      GROUP BY target_id
      ORDER BY count DESC
      LIMIT 10
    `);

    console.log(`   Remaining undefined: ${remaining[0].count}`);
    console.log(`   Fixed patterns:\n`);
    fixed.forEach(r => console.log(`   - ${r.target_id}: ${r.count}`));

    console.log('\n' + '=' .repeat(80));
    console.log('✅ Phase 87: Pattern Label Fix Complete!\n');
    console.log('Next steps:');
    console.log('  node scripts/phase87-knowledge-sync.mjs  # Re-sync to verify');
    console.log('  node scripts/phase86-autonomous-loop.mjs  # Test improved RAG\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
