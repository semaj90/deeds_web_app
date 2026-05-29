#!/usr/bin/env node
/**
 * summarize-calls-graph.mjs
 *
 * Analyze CALLS graph for quality/noise before Neo4j ingestion.
 *
 * Reports:
 * - Top callees (functions called most often)
 * - Top caller files (files with most outgoing calls)
 * - Calls per directory (where is the traffic?)
 * - Framework/noise calls (built-ins, node modules)
 * - Active-source calls (user code)
 * - sourceRef completeness (% of edges have sourceRefs)
 * - Sample 50 edges with sourceRefs
 */

import fs from 'fs';
import path from 'path';
import { readFileSync } from 'fs';

const INPUT_FILE = '.tmp/calls-edges-clean.ndjson';
const OUTPUT_JSON = '.tmp/calls-graph-summary.json';
const OUTPUT_MD = '.tmp/calls-graph-summary.md';

async function main() {
  console.log(`[SUMMARY] Reading CALLS graph from ${INPUT_FILE}...`);

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`ERROR: ${INPUT_FILE} not found`);
    process.exit(1);
  }

  // Load and parse NDJSON
  const lines = readFileSync(INPUT_FILE, 'utf-8').split('\n').filter(l => l.trim());
  const edges = lines.map((line, idx) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      console.warn(`[WARN] Line ${idx} parse error:`, line.substring(0, 100));
      return null;
    }
  }).filter(Boolean);

  console.log(`[SUMMARY] Loaded ${edges.length} CALLS edges`);

  // Analysis
  const stats = {
    total_edges: edges.length,
    unique_callees: new Set(),
    unique_callers: new Set(),
    unique_files: new Set(),
    callees_count: {},
    caller_files_count: {},
    calls_per_dir: {},
    framework_calls: 0,
    active_source_calls: 0,
    edges_with_sourceRef: 0,
    sample_edges: [],
  };

  // Categorize calls
  const frameworkPatterns = [
    /\.(map|filter|reduce|forEach|find|some|every)\b/,
    /^(console|require|import|process|Buffer|Promise|Array|Object|String|Number|JSON|Math|Date|Error|RegExp)\b/,
    /\._/,
    /\$state\b/,
    /\$derived\b/,
  ];

  const activeSourceDirs = [
    'src/',
    'scripts/',
    'sveltekit-frontend/src/',
  ];

  for (const edge of edges) {
    const { source_file, caller, callee, line_num } = edge;

    // Track unique entities
    stats.unique_callees.add(callee);
    stats.unique_callers.add(caller);
    if (source_file) stats.unique_files.add(source_file);

    // Count callees
    stats.callees_count[callee] = (stats.callees_count[callee] || 0) + 1;

    // Count callers per file
    stats.caller_files_count[source_file || 'unknown'] =
      (stats.caller_files_count[source_file || 'unknown'] || 0) + 1;

    // Count calls per directory
    if (source_file) {
      const dir = source_file.split('/').slice(0, -1).join('/') || 'root';
      stats.calls_per_dir[dir] = (stats.calls_per_dir[dir] || 0) + 1;
    }

    // Categorize as framework or active-source
    const isFramework = frameworkPatterns.some(p => p.test(callee));
    const isActiveSource = activeSourceDirs.some(d => source_file?.includes(d));

    if (isFramework) {
      stats.framework_calls++;
    } else if (isActiveSource) {
      stats.active_source_calls++;
    }

    // Track sourceRef completeness
    if (edge.source_file) {
      stats.edges_with_sourceRef++;
    }

    // Sample edges (first 50 with sourceRef)
    if (stats.sample_edges.length < 50 && edge.source_file) {
      stats.sample_edges.push({
        source_file: edge.source_file,
        line_num: edge.line_num,
        caller: edge.caller,
        callee: edge.callee,
      });
    }
  }

  // Convert Sets to counts
  stats.unique_callees_count = stats.unique_callees.size;
  stats.unique_callers_count = stats.unique_callers.size;
  stats.unique_files_count = stats.unique_files.size;
  delete stats.unique_callees;
  delete stats.unique_callers;
  delete stats.unique_files;

  // Top callees
  const top_callees = Object.entries(stats.callees_count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  // Top caller files
  const top_caller_files = Object.entries(stats.caller_files_count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([file, count]) => ({ file, count }));

  // Top directories
  const top_dirs = Object.entries(stats.calls_per_dir)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([dir, count]) => ({ dir, count }));

  const summary = {
    metadata: {
      generated_at: new Date().toISOString(),
      input_file: INPUT_FILE,
    },
    statistics: stats,
    top_callees,
    top_caller_files,
    top_directories: top_dirs,
    quality_assessment: {
      framework_call_percentage: ((stats.framework_calls / stats.total_edges) * 100).toFixed(1),
      active_source_call_percentage: ((stats.active_source_calls / stats.total_edges) * 100).toFixed(1),
      sourceRef_completeness: ((stats.edges_with_sourceRef / stats.total_edges) * 100).toFixed(1),
    },
    sample_edges: stats.sample_edges,
  };

  // Write JSON
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(summary, null, 2));
  console.log(`[SUMMARY] Wrote ${OUTPUT_JSON}`);

  // Write Markdown report
  const md = `# CALLS Graph Quality Summary

Generated: ${new Date().toISOString()}

## Overall Statistics

- **Total CALLS edges**: ${stats.total_edges.toLocaleString()}
- **Unique callees**: ${stats.unique_callees_count.toLocaleString()}
- **Unique callers**: ${stats.unique_callers_count.toLocaleString()}
- **Files with calls**: ${stats.unique_files_count.toLocaleString()}

## Quality Assessment

- **Framework/noise calls**: ${stats.framework_calls.toLocaleString()} (${summary.quality_assessment.framework_call_percentage}%)
- **Active-source calls**: ${stats.active_source_calls.toLocaleString()} (${summary.quality_assessment.active_source_call_percentage}%)
- **Edges with sourceRef**: ${stats.edges_with_sourceRef.toLocaleString()} (${summary.quality_assessment.sourceRef_completeness}%)

## Top 20 Callees (most called functions)

${top_callees.map((c, i) => `${i+1}. **${c.name}** — ${c.count.toLocaleString()} calls`).join('\n')}

## Top 20 Caller Files (most outgoing calls)

${top_caller_files.map((f, i) => `${i+1}. \`${f.file}\` — ${f.count.toLocaleString()} calls`).join('\n')}

## Top 20 Directories (call density)

${top_dirs.map((d, i) => `${i+1}. \`${d.dir}\` — ${d.count.toLocaleString()} calls`).join('\n')}

## Sample 50 CALLS Edges (with sourceRef)

\`\`\`
${stats.sample_edges.map((e, i) =>
  `${i+1}. ${path.basename(e.source_file)}:${e.line_num} — ${e.caller} → ${e.callee}`
).join('\n')}
\`\`\`

## Recommendations

${summary.quality_assessment.framework_call_percentage > 50
  ? '⚠️ **WARNING**: >50% framework calls detected. Consider adding filters for built-in methods.'
  : '✅ Framework calls <50%. Graph looks reasonable.'}

${summary.quality_assessment.sourceRef_completeness < 90
  ? '⚠️ **WARNING**: <90% sourceRef completeness. Many edges lack line number data.'
  : '✅ sourceRef completeness >90%. Good for debugging.'}

---

**Next Steps:**
- If graph quality looks good (>50% active-source, >90% sourceRef): Proceed to Phase 3 (USES_DB edges)
- If too noisy: Add framework filters and re-run extraction
`;

  fs.writeFileSync(OUTPUT_MD, md);
  console.log(`[SUMMARY] Wrote ${OUTPUT_MD}`);

  // Print key findings to console
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    CALLS GRAPH SUMMARY                         ║
╚════════════════════════════════════════════════════════════════╝

Total edges:            ${stats.total_edges.toLocaleString()}
Unique callees:         ${stats.unique_callees_count.toLocaleString()}
Unique callers:         ${stats.unique_callers_count.toLocaleString()}
Files with calls:       ${stats.unique_files_count.toLocaleString()}

Quality:
  Framework calls:      ${stats.framework_calls.toLocaleString()} (${summary.quality_assessment.framework_call_percentage}%)
  Active-source calls:  ${stats.active_source_calls.toLocaleString()} (${summary.quality_assessment.active_source_call_percentage}%)
  sourceRef complete:   ${summary.quality_assessment.sourceRef_completeness}%

Top Callees:
${top_callees.slice(0, 5).map((c, i) => `  ${i+1}. ${c.name} (${c.count})`).join('\n')}

Top Caller Files:
${top_caller_files.slice(0, 5).map((f, i) => `  ${i+1}. ${f.file} (${f.count})`).join('\n')}

Top Directories:
${top_dirs.slice(0, 5).map((d, i) => `  ${i+1}. ${d.dir} (${d.count})`).join('\n')}

═══════════════════════════════════════════════════════════════════
Recommendation:
${summary.quality_assessment.framework_call_percentage > 50
  ? '⚠️  High framework call ratio. Review before Neo4j ingestion.'
  : '✅  Quality looks good. Safe to proceed to Phase 3.'}
═══════════════════════════════════════════════════════════════════
  `);
}

main().catch(console.error);