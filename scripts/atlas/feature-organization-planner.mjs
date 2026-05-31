#!/usr/bin/env node
/**
 * feature-organization-planner.mjs
 *
 * Reads parent atlas + Neo4j topology + existing directory clusters and produces
 * a feature-grouped directory organization proposal.
 *
 * No file moves are executed — output is a plan with:
 *   - Top-level feature groups (evidence, cases, rag, legal-corpus, ai-agents, etc.)
 *   - Current scattered locations
 *   - Proposed consolidated path
 *   - Confidence score (high/medium/low based on signal strength)
 *
 * Operator reviews the plan before any moves.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import http from 'http';
import path from 'path';

const NEO4J_URI = 'http://localhost:7474';
const NEO4J_AUTH = Buffer.from('neo4j:neo4j123').toString('base64');

function neo4jQuery(cypher) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ statements: [{ statement: cypher }] });
    const req = http.request(
      {
        hostname: 'localhost',
        port: 7474,
        path: '/db/neo4j/tx/commit',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${NEO4J_AUTH}`,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.results?.[0]?.data || []);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Feature taxonomy derived from parent atlas + domain knowledge
const FEATURE_GROUPS = {
  evidence: {
    purpose: 'Evidence pipeline: ingest → analyze → custody chain → embeddings',
    table_signals: ['evidence', 'evidence_vectors', 'evidence_audit_log'],
    path_signals: ['evidence', 'forensics', 'ocr', 'video-ingest'],
    target_dir: 'sveltekit-frontend/src/lib/server/features/evidence/',
  },
  cases: {
    purpose: 'Case management: theory building, charges, discovery, timeline',
    table_signals: ['cases', 'case_notes', 'case_statute_links', 'case_reports', 'case_activities', 'contextTimeline'],
    path_signals: ['cases', 'case-theory', 'discovery'],
    target_dir: 'sveltekit-frontend/src/lib/server/features/cases/',
  },
  legalCorpus: {
    purpose: 'Legal corpus: statutes, citations, legal docs, precedents',
    table_signals: ['legal_documents', 'statutes', 'citations', 'legal_research', 'legal_precedents', 'statute_chunks', 'legal_glossary'],
    path_signals: ['legal', 'citations', 'statutes'],
    target_dir: 'sveltekit-frontend/src/lib/server/features/legal-corpus/',
  },
  rag: {
    purpose: 'RAG pipeline: Qdrant retrieval + reranking + Bifrost cache',
    table_signals: ['rag_sessions', 'rag_query_log', 'embedding_cache', 'chunk_hit_log'],
    path_signals: ['rag', 'retrieval', 'qdrant'],
    target_dir: 'sveltekit-frontend/src/lib/server/features/rag/',
  },
  aiAgents: {
    purpose: 'AI agents + LLM orchestration: Gemma4, ACE, KAG/DAG, tool calling',
    table_signals: ['kagDagRuns', 'kagDagNodes', 'kagDagEdges', 'aceRetrievalRuns', 'llm_outputs', 'llm_synthesis_events'],
    path_signals: ['ai', 'ace', 'agents', 'hermes', 'gemma4'],
    target_dir: 'sveltekit-frontend/src/lib/server/features/ai/',
  },
  observability: {
    purpose: 'Observability: analytics, audit, telemetry, RL feedback',
    table_signals: ['analytics_events', 'audit_log', 'api_audit_log', 'context_timeline', 'admin_telemetry', 'route_health_event', 'route_interaction_log'],
    path_signals: ['analytics', 'audit', 'telemetry', 'route-health'],
    target_dir: 'sveltekit-frontend/src/lib/server/features/observability/',
  },
  identity: {
    purpose: 'Auth + identity: Lucia sessions, users, password reset',
    table_signals: ['users', 'sessions', 'password_reset_tokens', 'email_verification_codes'],
    path_signals: ['auth', 'lucia', 'identity'],
    target_dir: 'sveltekit-frontend/src/lib/server/features/identity/',
  },
  codebaseIntel: {
    purpose: 'Codebase intelligence: atlas extraction, graphify, mutation ledger',
    table_signals: ['codebase_audit_reports', 'errorBrainPatch', 'metadata_envelopes'],
    path_signals: ['atlas', 'codeintel', 'indexer', 'graphify'],
    target_dir: 'sveltekit-frontend/src/lib/server/features/codebase-intel/',
  },
};

function classifyFile(filePath, tablesUsed) {
  const matches = [];
  for (const [groupName, group] of Object.entries(FEATURE_GROUPS)) {
    let score = 0;
    let signals = [];

    // Path signal
    for (const pathSig of group.path_signals) {
      if (filePath.toLowerCase().includes(pathSig)) {
        score += 2;
        signals.push(`path:${pathSig}`);
      }
    }

    // Table signal
    for (const table of tablesUsed) {
      if (group.table_signals.includes(table)) {
        score += 3;
        signals.push(`table:${table}`);
      }
    }

    if (score > 0) matches.push({ group: groupName, score, signals });
  }
  return matches.sort((a, b) => b.score - a.score);
}

async function main() {
  console.log('🚀 Feature Organization Planner');
  console.log('Sources: parent atlas + Neo4j topology + directory clusters');
  console.log();

  // Step 1: Get file → tables mapping from Neo4j
  console.log('[1/4] Querying Neo4j for file → table relationships...');
  const fileTableRows = await neo4jQuery(`
    MATCH (f:CodebaseFile)-[:USES_DB]->(t:DBTable)
    WHERE f.filePath STARTS WITH 'sveltekit-frontend/src/lib/server/'
    RETURN f.filePath AS file, collect(DISTINCT t.name) AS tables
    LIMIT 500
  `);
  console.log(`  ✓ ${fileTableRows.length} server files with DB usage`);

  // Step 2: Classify each file into a feature group
  console.log('[2/4] Classifying files into feature groups...');
  const classifications = {};
  for (const groupName of Object.keys(FEATURE_GROUPS)) {
    classifications[groupName] = [];
  }
  let unclassified = 0;

  for (const row of fileTableRows) {
    const [file, tables] = row.row;
    const matches = classifyFile(file, tables);
    if (matches.length > 0) {
      const top = matches[0];
      classifications[top.group].push({
        file,
        score: top.score,
        signals: top.signals,
        tables_used: tables,
      });
    } else {
      unclassified++;
    }
  }

  for (const [group, files] of Object.entries(classifications)) {
    console.log(`  ${group.padEnd(20)} ${files.length} files`);
  }
  console.log(`  ${'(unclassified)'.padEnd(20)} ${unclassified} files`);

  // Step 3: Build the proposal
  console.log('[3/4] Building organization proposal...');
  const proposal = {
    generated_at: new Date().toISOString(),
    methodology: 'Score-based classification: path signals (+2) + table signals (+3). Highest score wins.',
    feature_groups: {},
    summary: {
      total_files_classified: fileTableRows.length - unclassified,
      total_unclassified: unclassified,
      proposed_target_dirs: Object.keys(FEATURE_GROUPS).length,
    },
  };

  for (const [groupName, group] of Object.entries(FEATURE_GROUPS)) {
    const files = classifications[groupName];
    const currentDirs = new Set();
    for (const { file } of files) {
      currentDirs.add(path.posix.dirname(file));
    }

    proposal.feature_groups[groupName] = {
      purpose: group.purpose,
      target_dir: group.target_dir,
      file_count: files.length,
      current_scattered_dirs: [...currentDirs].sort(),
      sample_files: files.slice(0, 8).map(f => ({
        file: f.file,
        score: f.score,
        signals: f.signals,
        tables: f.tables_used,
      })),
      files: files.map(f => f.file),
      confidence: files.length >= 5

        ? 'high'
        : files.length >= 2
          ? 'medium'
          : 'low',
    };
  }

  // Step 4: Write proposal
  console.log('[4/4] Writing proposal...');
  const outPath = '.tmp/feature-organization-proposal.json';
  writeFileSync(outPath, JSON.stringify(proposal, null, 2));
  console.log(`  ✓ ${outPath}`);

  // Markdown report
  const md = renderMarkdown(proposal);
  const mdPath = '.tmp/feature-organization-proposal.md';
  writeFileSync(mdPath, md);
  console.log(`  ✓ ${mdPath}`);

  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Feature Organization Proposal Ready');
  console.log(`  Classified: ${proposal.summary.total_files_classified} files`);
  console.log(`  Unclassified: ${proposal.summary.total_unclassified}`);
  console.log(`  Feature groups: ${Object.keys(FEATURE_GROUPS).length}`);
  console.log();
  console.log('Review proposal before any directory moves:');
  console.log(`  cat .tmp/feature-organization-proposal.md`);
  console.log('═══════════════════════════════════════════════════════════════');
}

function renderMarkdown(proposal) {
  let md = `# SvelteKit Frontend — Feature Organization Proposal
**Generated**: ${proposal.generated_at}
**Method**: ${proposal.methodology}

## Summary
- **Total files classified**: ${proposal.summary.total_files_classified}
- **Unclassified**: ${proposal.summary.total_unclassified}
- **Proposed feature groups**: ${proposal.summary.proposed_target_dirs}

---

`;

  for (const [groupName, group] of Object.entries(proposal.feature_groups)) {
    const conf = group.confidence === 'high' ? '🟢' : group.confidence === 'medium' ? '🟡' : '🔴';
    md += `## ${conf} ${groupName} (${group.file_count} files)
**Purpose**: ${group.purpose}
**Target dir**: \`${group.target_dir}\`
**Confidence**: ${group.confidence}

### Currently scattered across ${group.current_scattered_dirs.length} directories:
${group.current_scattered_dirs.slice(0, 8).map(d => `- \`${d}\``).join('\n')}
${group.current_scattered_dirs.length > 8 ? `- ...+${group.current_scattered_dirs.length - 8} more` : ''}

### Sample files (with classification signals):
${group.sample_files.map(f => `- \`${f.file}\` — score ${f.score}, signals: \`${f.signals.join(', ')}\``).join('\n')}

---

`;
  }

  md += `## Next Steps (operator approval required)
1. Review this proposal end-to-end
2. For each \`high\`-confidence group: approve the consolidation
3. For each \`medium\`/\`low\`-confidence group: review individual files, refine table/path signals, re-run
4. Once approved per-group, generate the actual \`git mv\` patch (not yet implemented — separate script)
5. Update all import paths after moves
6. Re-run \`graphify:full\` to verify topology is unchanged

## Constraints
- **No moves without operator approval** — this is a plan, not an action
- Each move requires updating imports across consumer files (use AST-aware rewriter)
- SvelteKit route files (\`+page.svelte\`, \`+server.ts\`, \`+layout.svelte\`) must stay in \`src/routes/\` — feature consolidation applies only to \`src/lib/server/\`
- Component grouping (\`src/lib/components/\`) is a separate problem (different signals: UI not data)
`;

  return md;
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});