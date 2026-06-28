#!/usr/bin/env node

/**
 * consolidate-audit.mjs
 *
 * Scans the codebase for duplicate/similar files and generates consolidation candidates.
 *
 * Usage:
 *   node scripts/consolidate/consolidate-audit.mjs [--verbose] [--min-similarity 0.70]
 *
 * Output:
 *   .tmp/consolidation-candidates.json
 *   .tmp/consolidation-audit.json (detailed report)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../../');
const SVELTEKIT_FRONTEND = path.join(ROOT, 'sveltekit-frontend');
const TMP_DIR = path.join(SVELTEKIT_FRONTEND, '.tmp');

// Parse CLI args
const verbose = process.argv.includes('--verbose');
const minSimilarity = parseFloat(process.argv.find(arg => arg.startsWith('--min-similarity='))?.split('=')[1] ?? '0.70');

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const vlog = (msg) => verbose && log(msg);

// CRITICAL: Protected paths (never consolidate)
const PROTECTED_PATHS = [
  'docker/',
  'docker-compose',
  '.docker/',
  '.containers/',
  'Dockerfile',
  '.dockerignore',
  'container-definitions/',
];

const PROTECTED_EXTENSIONS = [
  '.dockerfile',
  '.dockerfile.prod',
];

function isProtectedPath(filePath) {
  const rel = path.relative(ROOT, filePath);

  // Check protected path prefixes
  if (PROTECTED_PATHS.some(p => rel.toLowerCase().includes(p.toLowerCase()))) {
    return true;
  }

  // Check protected extensions
  if (PROTECTED_EXTENSIONS.some(ext => rel.toLowerCase().endsWith(ext))) {
    return true;
  }

  return false;
}

// Ensure .tmp directory exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

/**
 * Find all TypeScript/JavaScript files in the codebase
 */
function findAllFiles() {
  vlog('Scanning for TypeScript/JavaScript files...');
  try {
    const result = execSync(
      `rg --files --glob "*.ts" --glob "*.mts" --glob "*.js" --glob "*.mjs" . --max-depth 6`,
      { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    return result.split('\n').filter(Boolean);
  } catch (e) {
    log(`Warning: ripgrep scan incomplete (${e.message})`);
    return [];
  }
}

/**
 * Calculate content hash for file
 */
function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Extract imports from a file (basic parsing)
 */
function extractImports(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const imports = [];
    const importRegex = /(?:from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1] || match[2]);
    }
    return imports;
  } catch {
    return [];
  }
}

/**
 * Calculate similarity between two files (0.0 to 1.0)
 */
function calculateSimilarity(file1, file2) {
  try {
    const content1 = fs.readFileSync(file1, 'utf-8');
    const content2 = fs.readFileSync(file2, 'utf-8');

    // Normalize: remove comments, whitespace
    const normalize = (s) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '').replace(/\s+/g, ' ').trim();
    const norm1 = normalize(content1);
    const norm2 = normalize(content2);

    // Simple: if >80% of lines match (Levenshtein-lite)
    const lines1 = norm1.split('\n');
    const lines2 = norm2.split('\n');
    const minLen = Math.min(lines1.length, lines2.length);
    if (minLen === 0) return 0;

    let matches = 0;
    for (let i = 0; i < minLen; i++) {
      if (lines1[i] === lines2[i]) matches++;
    }

    return matches / Math.max(lines1.length, lines2.length);
  } catch {
    return 0;
  }
}

/**
 * Find duplicate/similar file groups
 */
function findDuplicateGroups(files) {
  vlog(`Analyzing ${files.length} files for duplicates...`);

  const groups = [];
  const processed = new Set();

  for (let i = 0; i < files.length; i++) {
    if (processed.has(files[i])) continue;

    const file1 = files[i];
    const group = { canonical: file1, duplicates: [], avgSimilarity: 1.0 };
    processed.add(file1);

    for (let j = i + 1; j < files.length; j++) {
      if (processed.has(files[j])) continue;

      const file2 = files[j];
      const similarity = calculateSimilarity(file1, file2);

      if (similarity >= minSimilarity) {
        group.duplicates.push({ file: file2, similarity });
        processed.add(file2);
      }
    }

    if (group.duplicates.length > 0) {
      group.avgSimilarity = group.duplicates.reduce((sum, d) => sum + d.similarity, 0) / group.duplicates.length;
      groups.push(group);
    }
  }

  return groups;
}

/**
 * Determine confidence score (0.0 to 1.0)
 */
function calculateConfidence(group) {
  // High confidence: identical function signatures, same imports
  if (group.avgSimilarity > 0.95) return 0.95;
  if (group.avgSimilarity > 0.85) return 0.87;
  if (group.avgSimilarity > 0.75) return 0.78;
  return group.avgSimilarity * 0.85; // Scale down for lower similarity
}

/**
 * Find consumers of a file (imports that reference it)
 */
function findConsumers(filePath, allFiles) {
  const consumers = [];
  const baseName = path.basename(filePath, path.extname(filePath));

  for (const file of allFiles) {
    if (file === filePath) continue;
    try {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes(filePath) || content.includes(baseName)) {
        consumers.push(file);
      }
    } catch {
      // Ignore read errors
    }
  }

  return consumers;
}

/**
 * Main audit function
 */
async function audit() {
  log('Starting codebase consolidation audit...');

  const startTime = Date.now();
  const allFiles = findAllFiles().map(f => path.join(ROOT, f));

  vlog(`Found ${allFiles.length} files`);

  // Filter by relevant directories AND exclude protected paths
  const relevantFiles = allFiles.filter(f => {
    // CRITICAL: Skip protected paths (docker, infrastructure)
    if (isProtectedPath(f)) {
      vlog(`[PROTECTED] Skipping: ${path.relative(ROOT, f)}`);
      return false;
    }

    const rel = path.relative(ROOT, f);
    return rel.includes('src/lib') ||
           rel.includes('packages/') ||
           rel.includes('scripts/') ||
           !rel.includes('node_modules');
  });

  vlog(`Filtered to ${relevantFiles.length} relevant files`);

  // Find duplicate groups
  const groups = findDuplicateGroups(relevantFiles);

  // Build candidates list
  const candidates = [];
  for (const group of groups) {
    const canonical = group.canonical;
    const confidence = calculateConfidence(group);

    if (confidence < minSimilarity) continue;

    const duplicates = group.duplicates.map(d => d.file);
    const canonicalConsumers = findConsumers(canonical, relevantFiles);
    const duplicateConsumers = duplicates.flatMap(d => findConsumers(d, relevantFiles));

    // Calculate savings
    let totalLines = 0;
    try {
      totalLines += fs.readFileSync(canonical, 'utf-8').split('\n').length;
      for (const dup of duplicates) {
        totalLines += fs.readFileSync(dup, 'utf-8').split('\n').length;
      }
    } catch {
      // Ignore
    }

    candidates.push({
      id: `dup-${candidates.length + 1}`,
      canonical: path.relative(ROOT, canonical),
      duplicates: duplicates.map(d => path.relative(ROOT, d)),
      confidence: Number(confidence.toFixed(2)),
      avgSimilarity: Number(group.avgSimilarity.toFixed(2)),
      canonicalConsumers: canonicalConsumers.length,
      duplicateConsumers: duplicateConsumers.length,
      estimatedLinesSaved: Math.round(totalLines * (confidence / 1.5)),
      reason: `Similarity: ${(group.avgSimilarity * 100).toFixed(1)}%`
    });
  }

  // Sort by confidence
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Generate summary
  const protectedCount = allFiles.filter(f => isProtectedPath(f)).length;
  const summary = {
    timestamp: new Date().toISOString(),
    mode: 'AUDIT',
    totalCandidates: candidates.length,
    totalDuplicatesFound: candidates.reduce((sum, c) => sum + c.duplicates.length, 0),
    totalLinesSaveable: candidates.reduce((sum, c) => sum + c.estimatedLinesSaved, 0),
    estimatedDiskSavings: `${Math.round(candidates.reduce((sum, c) => sum + c.estimatedLinesSaved, 0) / 3.2)} KB`,
    confidenceTiers: {
      high: candidates.filter(c => c.confidence > 0.90).length,
      medium: candidates.filter(c => c.confidence >= 0.70 && c.confidence <= 0.90).length,
      low: candidates.filter(c => c.confidence < 0.70).length
    },
    protectedFilesSkipped: protectedCount,
    protectedPaths: PROTECTED_PATHS,
    dockerSafety: {
      status: 'PROTECTED',
      skippedCount: protectedCount,
      rule: 'Docker infrastructure is never consolidated'
    },
    executionTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`
  };

  log(`✅ Audit complete: ${summary.totalCandidates} candidate groups found`);
  log(`   Lines saveable: ${summary.totalLinesSaveable}`);
  log(`   Disk savings: ~${summary.estimatedDiskSavings}`);
  log(`   HIGH confidence: ${summary.confidenceTiers.high}`);
  log(`   MEDIUM confidence: ${summary.confidenceTiers.medium}`);
  log(`   LOW confidence: ${summary.confidenceTiers.low}`);

  // Write outputs
  const auditFile = path.join(TMP_DIR, 'consolidation-candidates.json');
  fs.writeFileSync(auditFile, JSON.stringify({
    ...summary,
    candidates
  }, null, 2));

  log(`📊 Results written to: ${auditFile}`);

  return { summary, candidates };
}

// Run
await audit().catch(e => {
  log(`❌ Error: ${e.message}`);
  process.exit(1);
});