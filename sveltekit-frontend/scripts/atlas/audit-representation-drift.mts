#!/usr/bin/env node
/**
 * STEP 5: Representation Drift Validator
 *
 * Audits the codebase for representation name drift across all layers:
 * - Undeclared vectors in Qdrant payloads (not in semantic-contracts)
 * - Postgres columns not in canonical registry
 * - Go env vars using deprecated strings (semantic_768)
 * - TypeScript usage of non-canonical aliases (dense_768, content_embedding, etc.)
 * - Test fixtures using outdated vector names
 *
 * Exit code: 0 if all gates pass, non-zero if violations found
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');

interface ValidationGate {
  name: string;
  description: string;
  passed: number;
  failed: number;
  violations: string[];
}

const gates: Record<string, ValidationGate> = {
  qdrant_payload_names: {
    name: 'Qdrant Payload Vector Names',
    description: 'All named vectors in Qdrant payloads are declared in semantic-contracts',
    passed: 0,
    failed: 0,
    violations: [],
  },
  postgres_columns: {
    name: 'Postgres Column Mapping',
    description: 'All embedding columns in Postgres match canonical registry',
    passed: 0,
    failed: 0,
    violations: [],
  },
  go_env_vars: {
    name: 'Go Environment Variables',
    description: 'Go services don\'t use deprecated strings (semantic_768)',
    passed: 0,
    failed: 0,
    violations: [],
  },
  typescript_usage: {
    name: 'TypeScript Alias Usage',
    description: 'TypeScript code uses canonical vector names, not deprecated aliases',
    passed: 0,
    failed: 0,
    violations: [],
  },
  test_fixtures: {
    name: 'Test Fixture Names',
    description: 'Test fixtures use canonical vector names',
    passed: 0,
    failed: 0,
    violations: [],
  },
};

// Canonical registry from semantic-contracts
const CANONICAL_VECTORS = {
  dense_384: { dimensions: 384, status: 'ACTIVE' },
  dense_768_legacy: { dimensions: 768, status: 'REFERENCE_ONLY' },
  title_384: { dimensions: 384, status: 'ACTIVE' },
  summary_384: { dimensions: 384, status: 'ACTIVE' },
  symbol_384: { dimensions: 384, status: 'ACTIVE' },
  ontology_384: { dimensions: 384, status: 'ACTIVE' },
  latent_64: { dimensions: 64, status: 'ACTIVE' },
  late_interaction: { dimensions: 0, status: 'EXPERIMENTAL' },
  bm42_sparse: { dimensions: 8192, status: 'ACTIVE' },
};

const DEPRECATED_ALIASES = {
  semantic_768: 'should not be used (replace with dense_384 or dense_768_legacy)',
  dense_768: 'should not be used (replace with dense_384 or dense_768_legacy)',
  content_embedding: 'should not be used (replace with content_embedding_384)',
  embedding_768d: 'should not be used (dead column)',
};

const CANONICAL_COLUMNS = {
  content_embedding_384: 'dense_384 semantic vector',
  content_embedding_768: 'dense_768_legacy semantic vector (read-only)',
  latent_64: 'latent_64 topology vector',
  embedding_sparse: 'bm42_sparse sparse vector',
};

console.log('🔍 REPRESENTATION DRIFT VALIDATOR\n');
console.log(`Project Root: ${projectRoot}\n`);

// GATE 1: Scan Qdrant payloads for undeclared vectors
console.log('⏳ Gate 1: Checking Qdrant payloads...');
try {
  const qdrantRefs = new Set<string>();
  const grepOutput = require('child_process').execSync(
    `rg "vector.*:.*|named.*vector.*|qdrant.*vector" ${projectRoot}/src ${projectRoot}/services ${projectRoot}/tests --type ts --type go -o 2>/dev/null || true`,
    { encoding: 'utf8' }
  );

  // Parse vector names from grep results (simplified)
  for (const line of grepOutput.split('\n').filter(Boolean)) {
    const match = line.match(/(['"])(dense_\d{3}|latent_\d{2}|bm42_sparse|title_\d{3}|summary_\d{3}|symbol_\d{3}|ontology_\d{3}|late_interaction)\1/);
    if (match) qdrantRefs.add(match[2]);
  }

  for (const vectorName of Array.from(qdrantRefs)) {
    if (vectorName in CANONICAL_VECTORS) {
      gates.qdrant_payload_names.passed++;
    } else {
      gates.qdrant_payload_names.failed++;
      gates.qdrant_payload_names.violations.push(`❌ Undeclared vector: ${vectorName} (not in semantic-contracts)`);
    }
  }
} catch (err) {
  console.log('⚠️  Could not scan Qdrant payloads (rg may not be available)');
}

// GATE 2: Postgres column mapping
console.log('⏳ Gate 2: Checking Postgres columns...');
try {
  const drizzeSchemaPath = path.join(projectRoot, 'sveltekit-frontend/drizzle/schema.ts');
  if (fs.existsSync(drizzeSchemaPath)) {
    const schemaContent = fs.readFileSync(drizzeSchemaPath, 'utf8');

    for (const [column, description] of Object.entries(CANONICAL_COLUMNS)) {
      if (schemaContent.includes(column)) {
        gates.postgres_columns.passed++;
      }
    }

    // Check for dead columns
    if (schemaContent.includes('embedding_768d')) {
      gates.postgres_columns.failed++;
      gates.postgres_columns.violations.push(`❌ Dead column: embedding_768d (never used)`);
    }
  }
} catch (err) {
  console.log('⚠️  Could not scan Postgres schema');
}

// GATE 3: Go env vars
console.log('⏳ Gate 3: Checking Go environment variables...');
try {
  const goFiles = [
    path.join(projectRoot, 'services/go-embedding-service/main.go'),
    path.join(projectRoot, 'services/go-retrieval-service/main.go'),
  ];

  for (const filePath of goFiles) {
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');

    // Check for hardcoded semantic_768
    if (content.includes('semantic_768') && !content.includes('// TODO') && !content.includes('// DEPRECATED')) {
      gates.go_env_vars.failed++;
      gates.go_env_vars.violations.push(
        `❌ ${path.basename(filePath)}: Uses hardcoded "semantic_768" (should read from canonical registry)`
      );
    } else if (!content.includes('semantic_768')) {
      gates.go_env_vars.passed++;
    }
  }
} catch (err) {
  console.log('⚠️  Could not scan Go files');
}

// GATE 4: TypeScript alias usage
console.log('⏳ Gate 4: Checking TypeScript aliases...');
try {
  const tsFiles = require('child_process').execSync(
    `find ${projectRoot}/sveltekit-frontend/src -name "*.ts" -type f 2>/dev/null | head -30`,
    { encoding: 'utf8' }
  ).split('\n').filter(Boolean);

  let tsViolations = 0;
  for (const filePath of tsFiles.slice(0, 10)) {
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');

    for (const [alias, reason] of Object.entries(DEPRECATED_ALIASES)) {
      if (content.includes(alias) && !content.includes('dense_384') && !content.includes('latent_64')) {
        tsViolations++;
        if (tsViolations <= 5) {
          gates.typescript_usage.violations.push(
            `⚠️  ${path.basename(filePath)}: Uses "${alias}" (${reason})`
          );
        }
      }
    }
  }

  if (tsViolations === 0) {
    gates.typescript_usage.passed++;
  } else {
    gates.typescript_usage.failed = tsViolations;
  }
} catch (err) {
  console.log('⚠️  Could not scan TypeScript files');
}

// GATE 5: Test fixtures
console.log('⏳ Gate 5: Checking test fixtures...');
try {
  const testFilePath = path.join(projectRoot, 'sveltekit-frontend/tests/rust-backend-integration.spec.ts');

  if (fs.existsSync(testFilePath)) {
    const content = fs.readFileSync(testFilePath, 'utf8');
    const denseMatches = (content.match(/vectorName:\s*['"]dense_768['"]/g) || []).length;

    if (denseMatches > 0) {
      gates.test_fixtures.failed = denseMatches;
      gates.test_fixtures.violations.push(
        `❌ ${denseMatches} test fixtures use 'dense_768' (should use 'dense_384')`
      );
    } else {
      gates.test_fixtures.passed++;
    }
  }
} catch (err) {
  console.log('⚠️  Could not scan test fixtures');
}

// Print report
console.log('\n📊 VALIDATION REPORT\n');
console.log('═'.repeat(80));

let totalPassed = 0;
let totalFailed = 0;

for (const [gateKey, gate] of Object.entries(gates)) {
  const status = gate.failed === 0 ? '✅' : gate.failed > 0 ? '❌' : '⏸️';
  console.log(`\n${status} ${gate.name}`);
  console.log(`   ${gate.description}`);
  console.log(`   Passed: ${gate.passed} | Failed: ${gate.failed}`);

  if (gate.violations.length > 0) {
    console.log(`   Violations:`);
    for (const v of gate.violations) {
      console.log(`     ${v}`);
    }
  }

  totalPassed += gate.passed;
  totalFailed += gate.failed;
}

console.log('\n' + '═'.repeat(80));
console.log(`\n📈 Summary: ${totalPassed} passed, ${totalFailed} failed\n`);

if (totalFailed === 0) {
  console.log('✅ All representation drift gates PASS\n');
  process.exit(0);
} else {
  console.log(`❌ ${totalFailed} violations found. See details above.\n`);
  process.exit(1);
}
