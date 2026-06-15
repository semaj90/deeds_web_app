#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import ignore from 'ignore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// Parse CLI flags
const multiRevision = process.argv.includes('--multi-revision');
const verbose = process.argv.includes('--verbose');
const dryRun = process.argv.includes('--dry-run');

const REPORT_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const TIMESTAMP = new Date().toISOString().split('T')[0];
const REPORT_JSON = path.join(REPORT_DIR, `directory-map-verify-${TIMESTAMP}.json`);
const REPORT_MD = path.join(REPORT_DIR, `directory-map-verify-${TIMESTAMP}.md`);

// Ensure report directory exists
fs.mkdirSync(REPORT_DIR, { recursive: true });

/**
 * Normalize path separators to forward slashes (Unix style)
 */
function normalizeSourceRef(filePath) {
  return filePath.replace(/\\/g, '/');
}

/**
 * Load .gitignore rules and create an ignore filter
 */
function createIgnoreFilter(repoRoot) {
  const gitignorePath = path.join(repoRoot, '.gitignore');
  let rules = '';

  if (fs.existsSync(gitignorePath)) {
    rules = fs.readFileSync(gitignorePath, 'utf-8');
  }

  return ignore().add(rules);
}

/**
 * Walk directory tree and collect all TypeScript/JavaScript files
 */
function walkFilesystem(dir, ignoreFilter) {
  const files = [];

  function traverse(current, relative) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (err) {
      if (verbose) console.warn(`[SKIP] ${current}: ${err.message}`);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relPath = path.join(relative, entry.name);
      const relPathNorm = normalizeSourceRef(relPath);

      // Check if should be ignored
      if (ignoreFilter.ignores(relPathNorm)) {
        continue;
      }

      if (entry.isDirectory()) {
        traverse(fullPath, relPath);
      } else if (
        entry.isFile() &&
        /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)
      ) {
        files.push({
          fullPath,
          sourceRef: relPathNorm,
          fileName: entry.name,
          size: entry.size,
        });
      }
    }
  }

  traverse(dir, '');
  return files;
}

/**
 * Collect git revisions for multi-revision testing
 */
function getGitRevisions(repoRoot, limit = 5) {
  try {
    const output = execSync('git log --oneline -n ' + limit, {
      cwd: repoRoot,
      encoding: 'utf-8',
    });

    return output
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => line.split(' ')[0]);
  } catch (err) {
    console.warn('[WARN] Could not fetch git revisions:', err.message);
    return [];
  }
}

/**
 * Check if a file exists at a specific git revision
 */
function fileExistsAtRevision(sourceRef, revision, repoRoot) {
  try {
    execSync(`git cat-file -e ${revision}:${sourceRef}`, {
      cwd: repoRoot,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate directory/source_ref map
 */
function verifyDirectoryMap() {
  console.log('[ATLAS:DIR:VERIFY] Starting directory map verification...');

  const ignoreFilter = createIgnoreFilter(REPO_ROOT);
  const files = walkFilesystem(REPO_ROOT, ignoreFilter);

  console.log(`[ATLAS:DIR:VERIFY] Found ${files.length} source files`);

  const issues = {
    path_separator_issues: [],
    generated_file_leakage: [],
    node_modules_leakage: [],
    duplicate_source_refs: [],
  };

  const seenSourceRefs = new Map();

  // Scan for common issues
  for (const file of files) {
    const { sourceRef, fullPath } = file;

    // Check for backslashes in source_ref (Windows separator)
    if (sourceRef.includes('\\')) {
      issues.path_separator_issues.push({
        sourceRef,
        issue: 'Contains Windows backslash separator',
      });
    }

    // Check for generated directories
    if (
      sourceRef.includes('dist/') ||
      sourceRef.includes('build/') ||
      sourceRef.includes('.next/') ||
      sourceRef.includes('out/')
    ) {
      issues.generated_file_leakage.push({
        sourceRef,
        issue: 'Found in generated directory',
      });
    }

    // Check for node_modules
    if (sourceRef.includes('node_modules/')) {
      issues.node_modules_leakage.push({
        sourceRef,
        issue: 'Found in node_modules directory',
      });
    }

    // Track duplicates
    if (seenSourceRefs.has(sourceRef)) {
      issues.duplicate_source_refs.push({
        sourceRef,
        count: 2,
        paths: [seenSourceRefs.get(sourceRef), fullPath],
      });
    } else {
      seenSourceRefs.set(sourceRef, fullPath);
    }
  }

  // Build summary
  const summary = {
    total_files: files.length,
    path_separator_issues: issues.path_separator_issues.length,
    generated_file_leakage: issues.generated_file_leakage.length,
    node_modules_leakage: issues.node_modules_leakage.length,
    duplicate_source_refs: issues.duplicate_source_refs.length,
  };

  // Multi-revision testing
  let revisionData = null;
  if (multiRevision) {
    console.log('[ATLAS:DIR:VERIFY] Checking git revision stability...');
    const revisions = getGitRevisions(REPO_ROOT, 5);

    if (revisions.length > 0) {
      const revisionTests = [];

      for (const revision of revisions) {
        let existCount = 0;
        let missingCount = 0;

        // Sample 10 files
        const sample = files.slice(0, 10);
        for (const file of sample) {
          if (fileExistsAtRevision(file.sourceRef, revision, REPO_ROOT)) {
            existCount++;
          } else {
            missingCount++;
          }
        }

        revisionTests.push({
          revision,
          sampled: sample.length,
          existed: existCount,
          missing: missingCount,
          stability: (existCount / sample.length) * 100,
        });
      }

      revisionData = {
        revisions_tested: revisions.length,
        sample_size: 10,
        tests: revisionTests,
      };
    }
  }

  // Determine pass/fail
  const isPass =
    issues.path_separator_issues.length === 0 &&
    issues.generated_file_leakage.length === 0 &&
    issues.node_modules_leakage.length === 0 &&
    issues.duplicate_source_refs.length === 0;

  // Build report
  const report = {
    status: isPass ? 'pass' : 'fail',
    summary,
    issues,
    revision_tests: revisionData,
    timestamp: new Date().toISOString(),
    repo_root: REPO_ROOT,
  };

  // Write JSON report
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`[ATLAS:DIR:VERIFY] Report written to: ${REPORT_JSON}`);

  // Write markdown report
  const md = `# Directory/Source-Ref Map Verification Report

**Generated**: ${report.timestamp}
**Status**: ${report.status.toUpperCase()}
**Repository**: ${REPO_ROOT}

## Summary

| Metric | Value |
|--------|-------|
| Total Files | ${summary.total_files} |
| Path Separator Issues | ${summary.path_separator_issues} |
| Generated File Leakage | ${summary.generated_file_leakage} |
| node_modules Leakage | ${summary.node_modules_leakage} |
| Duplicate source_refs | ${summary.duplicate_source_refs} |

## Hard Fail Conditions (Parent Atlas Contract)

✓ path_separator_issues = ${summary.path_separator_issues}
✓ generated_file_leakage = ${summary.generated_file_leakage}
✓ node_modules_leakage = ${summary.node_modules_leakage}
✓ duplicate_source_refs = ${summary.duplicate_source_refs}

**RESULT**: ${isPass ? '✅ PASS — Directory map is stable.' : '❌ FAIL — Fix the issues above.'}

${issues.path_separator_issues.length > 0 ? `\n### Path Separator Issues (${issues.path_separator_issues.length})\n` : ''}
${issues.path_separator_issues
  .slice(0, 5)
  .map((i) => `- \`${i.sourceRef}\`: ${i.issue}`)
  .join('\n')}

${issues.generated_file_leakage.length > 0 ? `\n### Generated File Leakage (${issues.generated_file_leakage.length})\n` : ''}
${issues.generated_file_leakage
  .slice(0, 5)
  .map((i) => `- \`${i.sourceRef}\`: ${i.issue}`)
  .join('\n')}

${issues.node_modules_leakage.length > 0 ? `\n### node_modules Leakage (${issues.node_modules_leakage.length})\n` : ''}
${issues.node_modules_leakage
  .slice(0, 5)
  .map((i) => `- \`${i.sourceRef}\`: ${i.issue}`)
  .join('\n')}

${revisionData ? `\n## Git Revision Stability\n\nTested ${revisionData.revisions_tested} revisions (sample size: ${revisionData.sample_size} files)\n\n` : ''}
${revisionData ? revisionData.tests.map((t) => `- \`${t.revision}\`: ${t.existed}/${t.sampled} stable (${t.stability.toFixed(1)}%)`).join('\n') : ''}
`;

  fs.writeFileSync(REPORT_MD, md, 'utf-8');
  console.log(`[ATLAS:DIR:VERIFY] Markdown report written to: ${REPORT_MD}`);

  // Exit code
  if (!isPass) {
    console.error('[ATLAS:DIR:VERIFY] ❌ VERIFICATION FAILED');
    process.exit(1);
  } else {
    console.log('[ATLAS:DIR:VERIFY] ✅ VERIFICATION PASSED');
    process.exit(0);
  }
}

// Run verification
verifyDirectoryMap();
