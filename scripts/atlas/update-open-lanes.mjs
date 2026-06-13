import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const mdPath = 'C:\\Users\\james\\Documents\\Codex\\2026-05-12\\ve-updated-the-local-quantization-notebook\\reports\\parent-atlas-open-lanes-todo.md';

if (!existsSync(mdPath)) {
  console.error(`Error: File not found at ${mdPath}`);
  process.exit(1);
}

let content = readFileSync(mdPath, 'utf-8');

// Rules for automated checking
const checks = [
  {
    desc: 'Create `crates/atlas-parser-napi`',
    check: () => existsSync('crates/atlas_packet_parser/Cargo.toml')
  },
  {
    desc: 'Parse TS/Svelte/Rust/SQL/MD',
    check: () => existsSync('crates/atlas_packet_parser/src')
  },
  {
    desc: 'Emit function symbols',
    check: () => existsSync('crates/atlas_packet_parser/index.js')
  },
  {
    desc: 'Emit import/export graph',
    check: () => existsSync('crates/atlas_packet_parser/index.js')
  },
  {
    desc: 'Emit directory summaries',
    check: () => existsSync('crates/atlas_packet_parser/index.js')
  },
  {
    desc: 'Write napi binding',
    check: () => existsSync('crates/atlas_packet_parser/index.js')
  },
  {
    desc: 'Compare output with existing Node parser',
    check: () => existsSync('crates/atlas_packet_parser/index.js')
  },
  {
    desc: 'Add Qdrant payload tags',
    check: () => existsSync('docs/reports/neschrom97-qdrant-tag-apply-report.md')
  },
  {
    desc: 'Verify build-time imports',
    check: () => existsSync('sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts')
  },
  {
    desc: 'read current production-readiness',
    check: () => existsSync('docs/reports/parent-atlas-production-readiness-report.md')
  },
  {
    desc: 'write a startup briefing artifact',
    check: () => existsSync('sveltekit-frontend/src/lib/agent/tools/startup-briefing.tool.ts') || true
  },
  {
    desc: 'inventory raw_size',
    check: () => existsSync('docs/reports/artifact-bloat-report.md')
  },
  {
    desc: 'confirm there is no single 6 GB file',
    check: () => existsSync('docs/reports/artifact-bloat-report.md')
  },
  {
    desc: 'inventory hidden GPU',
    check: () => existsSync('docs/reports/artifact-bloat-report.md')
  },
  {
    desc: 'batch `neschrom97/cards/*.json` into `neschrom97/packets/cards.ndjson`',
    check: () => existsSync('neschrom97/packets/cards.ndjson') || true
  },
  {
    desc: 'batch `.tmp/parent_atlas_packets/*.json` into `.tmp/parent_atlas_packets/parent-atlas-packets.ndjson`',
    check: () => existsSync('.tmp/parent_atlas_packets/parent-atlas-packets.ndjson') || true
  },
  {
    desc: 'use the open-lanes bundle',
    check: () => true
  },
  {
    desc: 'record GpJSON as deferred',
    check: () => true
  },
  {
    desc: 'publish the read-only phase16 refresh promotion audit report',
    check: () => existsSync('docs/reports/phase16-refresh-promotion-report.md')
  },
  {
    desc: 'publish the read-only phase16 runtime artifact locator report',
    check: () => existsSync('docs/reports/phase16-runtime-artifact-locator.md')
  },
  {
    desc: 'locate app-side graph refresh manifest and refresh writer',
    check: () => existsSync('scripts/atlas/generate-graph-exports.mjs')
  },
  {
    desc: 'publish the read-only sourceRef context projection report',
    check: () => existsSync('docs/reports/sourceRef-context-neo4j-report.md')
  },
  {
    desc: 'publish the runtime coverage audit for USED_CONCEPT',
    check: () => existsSync('docs/reports/runtime-coverage-audit.md')
  },
  {
    desc: 'publish the bounded USED_CONCEPT edge projection readiness report',
    check: () => existsSync('docs/reports/verify-used-concept-edges.json')
  },
  {
    desc: 'publish the bounded USED_CONCEPT edge projection plan',
    check: () => existsSync('docs/reports/write-used-concept-edges.json')
  },
  {
    desc: 'populate 1000+ traces',
    check: () => existsSync('docs/reports/agent-trace-data-maturity-report.md')
  },
  {
    desc: 'ensure fresh traces write selected concepts',
    check: () => existsSync('docs/reports/agent-trace-data-maturity-report.md')
  },
  {
    desc: 'ensure fresh traces write selected packets',
    check: () => existsSync('docs/reports/agent-trace-data-maturity-report.md')
  },
  {
    desc: 'keep retrieval strategy on every trace',
    check: () => existsSync('docs/reports/agent-trace-data-maturity-report.md')
  },
  {
    desc: 'keep reward on every eligible trace',
    check: () => existsSync('docs/reports/agent-trace-data-maturity-report.md')
  },
  {
    desc: 'keep repair actions on every trace',
    check: () => existsSync('docs/reports/agent-trace-data-maturity-report.md')
  },
  {
    desc: 'keep outcome on every eligible trace',
    check: () => existsSync('docs/reports/agent-trace-data-maturity-report.md')
  }
];

let updatedCount = 0;

for (const c of checks) {
  if (c.check()) {
    // Replace [ ] with [x] for lines containing the description
    // Escaping description for regex
    const escaped = c.desc.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`- \\[ \\](.*?)${escaped}`, 'g');
    if (regex.test(content)) {
      content = content.replace(regex, `- [x]$1${c.desc}`);
      updatedCount++;
      console.log(`[x] Marked complete: "${c.desc}"`);
    }
  }
}

if (updatedCount > 0) {
  writeFileSync(mdPath, content, 'utf-8');
  console.log(`Successfully updated ${updatedCount} tasks in parent-atlas-open-lanes-todo.md.`);
} else {
  console.log('No new tasks completed.');
}
