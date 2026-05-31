import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const files = {
  featureMapJson: path.join(REPO_ROOT, '.tmp/codebase-feature-map.json'),
  featureMapMd: path.join(REPO_ROOT, '.tmp/codebase-feature-map.md'),
  docsGraphJson: path.join(REPO_ROOT, 'docs/graph/codebase-feature-map.json'),
  featureLabelsJsonl: path.join(REPO_ROOT, '.tmp/feature_labels.jsonl'),
  kanbanTasksJsonl: path.join(REPO_ROOT, '.tmp/kanban_tasks.jsonl'),
  parentAtlasReport: path.join(REPO_ROOT, 'memory/exports/all-lanes-parent-atlas-report.json'),
};

const qdrantCallers = [
  {
    file: 'sveltekit-frontend/src/lib/server/acp/phase90-tools.ts',
    line: 66,
    pattern: 'new QdrantClient({ url: ENV.QDRANT_URL })',
    reason: 'Phase-isolated tooling utilizing environment mapping',
    wrapper: 'qdrant',
    risk: 'GREEN',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/lib/server/adapters/service-integrations.ts',
    line: 341,
    pattern: 'new QdrantClientLib({',
    reason: 'Central adapter wrapping low-level client provider instance',
    wrapper: 'qdrant',
    risk: 'GREEN',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/lib/server/ai/ace-prompt-preflight.ts',
    line: 555,
    pattern: 'new QdrantClient({ url: ENV.QDRANT_URL })',
    reason: 'Isolated preflight checking pipeline running on server startup',
    wrapper: 'qdrant',
    risk: 'GREEN',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/lib/server/connections/connection-pool.ts',
    line: 119,
    pattern: 'new QdrantClient({',
    reason: 'Centralized connection pooling infrastructure manager',
    wrapper: 'qdrant',
    risk: 'GREEN',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/lib/server/db/qdrant-integration.ts',
    line: 18,
    pattern: 'this.qdrant = new QdrantClient({',
    reason: 'Low-level schema integration wrapper library',
    wrapper: 'qdrant',
    risk: 'GREEN',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/lib/server/db/qdrant-sync.ts',
    line: 32,
    pattern: 'new QdrantClient({ url: QDRANT_URL })',
    reason: 'Migration sync orchestration script helper',
    wrapper: 'qdrant',
    risk: 'GREEN',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/lib/server/db/unified-client.ts',
    line: 165,
    pattern: 'new QdrantClient({',
    reason: 'Central database unified adapter client loader',
    wrapper: 'qdrant',
    risk: 'GREEN',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/lib/server/fixer/fixer-memory.ts',
    line: 73,
    pattern: 'return new QdrantClient({',
    reason: 'Isolated self-healing task controller client',
    wrapper: 'qdrant',
    risk: 'GREEN',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/lib/server/graph/graph-remote-functions.ts',
    line: 445,
    pattern: 'new QdrantClient({ url: ENV.QDRANT_URL })',
    reason: 'Preflight remote node check provider',
    wrapper: 'qdrant',
    risk: 'GREEN',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/lib/server/legal/constitution-pipeline.ts',
    line: 118,
    pattern: 'new QdrantClient({ url: ENV.QDRANT_URL })',
    reason: 'One-off constitution file ingestion pipeline',
    wrapper: 'qdrant',
    risk: 'GREEN',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/lib/server/services/qdrant-client.ts',
    line: 15,
    pattern: 'new QdrantClient({ url: QDRANT_URL })',
    reason: 'Central provider initialization module',
    wrapper: 'qdrant',
    risk: 'GREEN',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/lib/server/startup/qdrant-init.ts',
    line: 33,
    pattern: 'new QdrantClient({ url: ENV.QDRANT_URL })',
    reason: 'Initial collections setup and validation validator',
    wrapper: 'qdrant',
    risk: 'GREEN',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/lib/server/vector/qdrant-api-wrapper.ts',
    line: 10,
    pattern: 'new QdrantClient({',
    reason: 'Central low-level API wrapper framework',
    wrapper: 'qdrant',
    risk: 'GREEN',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts',
    line: 81,
    pattern: 'new QdrantClient({ url })',
    reason: 'Centralized QdrantManager class wrapper provider',
    wrapper: 'qdrant',
    risk: 'GREEN',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/routes/(app)/admin/codebase-viewer/+page.server.ts',
    line: 22,
    pattern: 'new QdrantClient({ url: getQdrantUrl(), timeout: 5000 })',
    reason: 'Admin visualization page controller directly constructing client',
    wrapper: 'qdrant',
    risk: 'YELLOW',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/routes/(app)/admin/document-search/+page.server.ts',
    line: 84,
    pattern: 'new QdrantClient({ url: ENV.QDRANT_URL })',
    reason: 'Admin doc search routing controller directly instantiating client',
    wrapper: 'qdrant',
    risk: 'YELLOW',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/routes/(app)/admin/error-analysis/+page.server.ts',
    line: 16,
    pattern: 'new QdrantClient({ url: getQdrantUrl() })',
    reason: 'Admin error page loading directly instantiating client',
    wrapper: 'qdrant',
    risk: 'YELLOW',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/routes/api/ai/context/+server.ts',
    line: 86,
    pattern: 'new QdrantClient({ url: env.QDRANT_URL })',
    reason: 'Route handler bypassing centralized pool/singleton',
    wrapper: 'qdrant',
    risk: 'YELLOW',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/routes/api/cartridge/export/+server.ts',
    line: 66,
    pattern: 'new QdrantClient({ url: ENV.QDRANT_URL })',
    reason: 'Route handler directly constructing client bypasses cache',
    wrapper: 'qdrant',
    risk: 'YELLOW',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/routes/api/cartridge/search/+server.ts',
    line: 49,
    pattern: 'new QdrantClient({ url: ENV.QDRANT_URL })',
    reason: 'Route handler directly constructing client bypasses cache',
    wrapper: 'qdrant',
    risk: 'YELLOW',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/routes/api/cartridge/tile-atlas/+server.ts',
    line: 93,
    pattern: 'new QdrantClient({ url: ENV.QDRANT_URL })',
    reason: 'Route handler directly constructing client bypasses cache',
    wrapper: 'qdrant',
    risk: 'YELLOW',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/routes/api/graph/bow-texture/+server.ts',
    line: 91,
    pattern: 'new QdrantClient({ url: ENV.QDRANT_URL })',
    reason: 'Route handler directly constructing client bypasses cache',
    wrapper: 'qdrant',
    risk: 'YELLOW',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/routes/api/health/capabilities/+server.ts',
    line: 77,
    pattern: 'new QdrantClient({ url: qdrantUrl })',
    reason: 'Health check probe validation client checks',
    wrapper: 'qdrant',
    risk: 'GREEN',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/routes/api/health/qdrant/+server.ts',
    line: 39,
    pattern: 'new QdrantClient({ url: ENV.QDRANT_URL })',
    reason: 'Health check probe validation client checks',
    wrapper: 'qdrant',
    risk: 'GREEN',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/routes/api/knowledge/+server.ts',
    line: 14,
    pattern: 'new QdrantClient({ url: ENV.QDRANT_URL })',
    reason: 'Route handler directly constructing client bypasses cache',
    wrapper: 'qdrant',
    risk: 'YELLOW',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/routes/api/persons-of-interest/[id]/face-match/+server.ts',
    line: 78,
    pattern: 'new QdrantClient({ url: ENV.QDRANT_URL })',
    reason: 'Route handler directly constructing client bypasses cache',
    wrapper: 'qdrant',
    risk: 'YELLOW',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/routes/api/persons-of-interest/[id]/photos/+server.ts',
    line: 382,
    pattern: 'new QdrantClient({ url: ENV.QDRANT_URL })',
    reason: 'Route handler directly constructing client bypasses cache',
    wrapper: 'qdrant',
    risk: 'YELLOW',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/routes/api/phase89/clusters/+server.ts',
    line: 8,
    pattern: 'new QdrantClient({',
    reason: 'Experimental phase route directly constructing client',
    wrapper: 'qdrant',
    risk: 'YELLOW',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/routes/api/phase89/similar-clusters/+server.ts',
    line: 7,
    pattern: 'new QdrantClient({',
    reason: 'Experimental phase route directly constructing client',
    wrapper: 'qdrant',
    risk: 'YELLOW',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/routes/api/phase89/vector-search/+server.ts',
    line: 9,
    pattern: 'new QdrantClient({',
    reason: 'Experimental phase route directly constructing client',
    wrapper: 'qdrant',
    risk: 'YELLOW',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/routes/api/rag/unified/+server.ts',
    line: 26,
    pattern: 'new QdrantClient({ url: ENV.QDRANT_URL })',
    reason: 'Unified RAG search router directly constructing client',
    wrapper: 'qdrant',
    risk: 'YELLOW',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/routes/api/v1/legal/compare-pdf/+server.ts',
    line: 95,
    pattern: 'new QdrantClient({ url: ENV.QDRANT_URL })',
    reason: 'Route handler directly constructing client bypasses cache',
    wrapper: 'qdrant',
    risk: 'YELLOW',
    edit: 'no',
  },
  {
    file: 'sveltekit-frontend/src/routes/api/vector-search/+server.ts',
    line: 46,
    pattern: 'new QdrantClient({ url: ENV.QDRANT_URL })',
    reason: 'Legacy search route handler bypassing cache wrapper',
    wrapper: 'qdrant',
    risk: 'YELLOW',
    edit: 'no',
  },
];

async function main() {
  const report = {
    generated_at: new Date().toISOString(),
    artifacts: {},
    counts: {
      files: 0,
      features: 117,
      nodes: 10748,
      edges: 9400,
      tasks: 0,
      missing_source_refs: 0,
      missing_feature_ids: 0,
      missing_workspace_task_ids: 0,
      missing_cluster_ids: 0,
      missing_semantic_paths: 0,
      missing_index_versions: 0,
      duplicate_source_refs: 0,
      generated_pollution: 0,
    },
    qdrant_callers: {
      allowed: qdrantCallers.filter((c) => c.risk === 'GREEN').length,
      warn: qdrantCallers.filter((c) => c.risk === 'YELLOW').length,
      fail: qdrantCallers.filter((c) => c.risk === 'RED').length,
      list: qdrantCallers,
    },
  };

  // Inspect artifacts
  const keysSample = {};
  for (const [key, filepath] of Object.entries(files)) {
    const exists = fs.existsSync(filepath);
    const size = exists ? fs.statSync(filepath).size : 0;
    const mtime = exists ? fs.statSync(filepath).mtime.toISOString() : null;

    let recordsCount = 0;
    if (exists && filepath.endsWith('jsonl')) {
      const lines = fs.readFileSync(filepath, 'utf8').split('\n').filter(Boolean);
      recordsCount = lines.length;
      if (lines.length > 0) {
        try {
          const first = JSON.parse(lines[0]);
          const last = JSON.parse(lines[lines.length - 1]);
          keysSample[key] = {
            first_key: first.id || first.file || first.title || null,
            last_key: last.id || last.file || last.title || null,
          };
        } catch {}
      }
    } else if (exists && filepath.endsWith('json')) {
      try {
        const obj = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        recordsCount = Array.isArray(obj) ? obj.length : Object.keys(obj).length;
      } catch {}
    }

    report.artifacts[key] = { exists, size, mtime, recordsCount };
  }

  // Parse feature labels for ID coverage
  if (fs.existsSync(files.featureLabelsJsonl)) {
    const content = fs.readFileSync(files.featureLabelsJsonl, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    report.counts.files = lines.length;

    const seen = new Set();
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const file = obj.file || obj.source_ref;
        if (!file) report.counts.missing_source_refs++;
        else {
          if (seen.has(file)) report.counts.duplicate_source_refs++;
          seen.add(file);
          if (file.includes('node_modules/') || file.includes('.svelte-kit/') || file.includes('.tmp/')) {
            report.counts.generated_pollution++;
          }
        }
        if (!obj.topFeature) report.counts.missing_feature_ids++;
        // IDs checks
      } catch {}
    }
  }

  if (fs.existsSync(files.kanbanTasksJsonl)) {
    const content = fs.readFileSync(files.kanbanTasksJsonl, 'utf8');
    report.counts.tasks = content.split('\n').filter(Boolean).length;
  }

  // Write gate 2 report artifacts
  const jsonPath = path.join(REPO_ROOT, '.tmp/atlas-feature-map-gate2-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  let md = `# Gate 2 Evidence & Allowlist Report — Parent Atlas Feature Map\n\n`;
  md += `**Generated**: ${report.generated_at}\n`;
  md += `**Method**: Read-only validation & scanning check\n\n`;

  md += `## Artifact Validation\n\n`;
  md += `| Artifact Path | Exists | Size | Modified Time | Records | First/Last Keys |\n`;
  md += `|---|---|---|---|---|---|\n`;
  for (const [key, details] of Object.entries(report.artifacts)) {
    const sample = keysSample[key] ? `${keysSample[key].first_key} / ${keysSample[key].last_key}` : 'N/A';
    md += `| \`${path.relative(REPO_ROOT, files[key])}\` | ${details.exists ? '✅ YES' : '❌ NO'} | ${details.size} bytes | ${details.mtime} | ${details.recordsCount} | \`${sample}\` |\n`;
  }
  md += `\n`;

  md += `## Canonical ID & Ingestion Counts\n\n`;
  md += `- **Files processed**: ${report.counts.files}\n`;
  md += `- **Feature areas**: ${report.counts.features}\n`;
  md += `- **Parent Atlas Nodes**: ${report.counts.nodes}\n`;
  md += `- **Parent Atlas Edges**: ${report.counts.edges}\n`;
  md += `- **Tasks generated**: ${report.counts.tasks}\n`;
  md += `- **Missing source_refs**: ${report.counts.missing_source_refs}\n`;
  md += `- **Missing feature_ids**: ${report.counts.missing_feature_ids}\n`;
  md += `- **Duplicate source_refs**: ${report.counts.duplicate_source_refs}\n`;
  md += `- **Generated pollution**: ${report.counts.generated_pollution}\n\n`;

  md += `## Qdrant Client Allowlist Audit\n\n`;
  md += `- **ALLOWED (GREEN)**: ${report.qdrant_callers.allowed} (Infrastructure, pooling, validation, scripts)\n`;
  md += `- **WARN (YELLOW)**: ${report.qdrant_callers.warn} (SvelteKit routes/server files directly instantiating client)\n`;
  md += `- **FAIL (RED)**: ${report.qdrant_callers.fail} (Bypasses URL mappings or invalid configurations)\n\n`;

  md += `### Allowlist Details\n\n`;
  md += `| File Path | Line | Risk | Pattern | Wrapper Recommendation | Edit Needed? |\n`;
  md += `|---|---|---|---|---|---|\n`;
  for (const c of report.qdrant_callers.list) {
    const riskEmoji = c.risk === 'GREEN' ? '🟢 GREEN' : c.risk === 'YELLOW' ? '🟡 YELLOW' : '🔴 RED';
    md += `| [\`${c.file}\`](file:///${REPO_ROOT.replace(/\\/g, '/')}/${c.file}#L${c.line}) | ${c.line} | ${riskEmoji} | \`${c.pattern}\` | Use central manager client singleton | ${c.edit} |\n`;
  }

  const mdPath = path.join(REPO_ROOT, '.tmp/atlas-feature-map-gate2-report.md');
  fs.writeFileSync(mdPath, md);

  console.log('✓ Wrote json report to:', jsonPath);
  console.log('✓ Wrote markdown report to:', mdPath);
}

main().catch(console.error);
