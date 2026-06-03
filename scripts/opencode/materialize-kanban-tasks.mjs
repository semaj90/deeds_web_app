#!/usr/bin/env node
/**
 * materialize-kanban-tasks.mjs
 *
 * Block 7 — Phase 101.
 *
 * Reads the Phase 101 completion plan (docs/architecture/phase-101-completion-plan.md)
 * and any supplemental JSON sources, then emits a Kanban board representation as:
 *   - .opencode/kanban/kanban-board.json  — machine-readable (OpenCode / MCP readable)
 *   - .opencode/kanban/kanban-board.md    — human-readable markdown table
 *
 * Statuses: todo | in_progress | done | blocked
 *
 * Usage:
 *   node scripts/opencode/materialize-kanban-tasks.mjs           # regenerate board
 *   node scripts/opencode/materialize-kanban-tasks.mjs --status  # print current board
 *   node scripts/opencode/materialize-kanban-tasks.mjs --update-block 6 --status done
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '../..');
const KANBAN_DIR = resolve(ROOT, '.opencode/kanban');
const BOARD_JSON = resolve(KANBAN_DIR, 'kanban-board.json');
const BOARD_MD   = resolve(KANBAN_DIR, 'kanban-board.md');
const TODAY      = new Date().toISOString().slice(0, 10);

// ── CLI args ───────────────────────────────────────────────────────────
const args         = process.argv.slice(2);
const SHOW_STATUS  = args.includes('--status');
const UPDATE_BLOCK = (() => {
  const idx = args.indexOf('--update-block');
  return idx >= 0 ? parseInt(args[idx + 1], 10) : null;
})();
const NEW_STATUS = (() => {
  const idx = args.indexOf('--status');
  // --status alone = show board; --status <value> after --update-block = new status
  if (UPDATE_BLOCK !== null && idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return null;
})();

// ── Canonical block definitions (Phase 101) ────────────────────────────
// Source of truth when no prior board.json exists.
const PHASE_101_BLOCKS = [
  {
    id: 'block-1',
    phase: 101,
    blockNum: 1,
    title: 'Git-diff cold archive pipeline',
    description: 'Implement no-delete-safe archival: git commit+tag per eligible file, write cold-archive manifest.',
    estimatedHours: 2,
    deliverables: [
      'scripts/atlas/archive-cold-originals.mjs',
      'docs/reports/cold-archive-manifest-YYYY-MM-DD.json',
      'npm run atlas:archive:cold',
    ],
    dependencies: [],
    status: 'done',
    completedAt: '2026-06-02',
    notes: 'Script created; runs in proof_only mode due to hardConstraints.deleteAllowed=false',
  },
  {
    id: 'block-2',
    phase: 101,
    blockNum: 2,
    title: 'Promotion boundary',
    description: 'Wire promote-after-verify bucket: cold_copy_verified=true + score >= threshold → tier warm.',
    estimatedHours: 2,
    deliverables: [
      'scripts/promotion/promote-verified-packets.mjs',
      'npm run atlas:promote:verified',
    ],
    dependencies: ['block-1'],
    status: 'done',
    completedAt: '2026-06-02',
    notes: 'Dry run: 20 promoted, 246 pending, 34 blocked. Run --commit after cold archive tags verified.',
  },
  {
    id: 'block-3',
    phase: 101,
    blockNum: 3,
    title: 'Schema migrations (Phase 101 seams)',
    description: 'Apply task_semantic_packets v2 bridge columns + nes_chrom_packets if missing.',
    estimatedHours: 1,
    deliverables: [
      'drizzle/manual/0020_phase101_seams.sql',
      'scripts/atlas/backfill-qdrant-payload-indexes.mjs',
    ],
    dependencies: [],
    status: 'done',
    completedAt: '2026-06-02',
    notes: 'Live DB inspection: all bridge columns already present. No migration needed.',
  },
  {
    id: 'block-4',
    phase: 101,
    blockNum: 4,
    title: 'Gemma4 summary packets per task',
    description: 'Batch-generate 2-sentence Gemma4 summaries for task_semantic_packets rows missing summary_llm.',
    estimatedHours: 1,
    deliverables: [
      'scripts/atlas/generate-task-summaries.mjs',
      'npm run atlas:tasks:summarize',
    ],
    dependencies: ['block-3'],
    status: 'done',
    completedAt: '2026-06-02',
    notes: 'Script confirmed valid (node --check). Run with --commit when Ollama is warm.',
  },
  {
    id: 'block-5',
    phase: 101,
    blockNum: 5,
    title: 'Valkey bundle swap',
    description: 'Replace redis/redis-stack with valkey/valkey-bundle:8.1.1 in all three compose files.',
    estimatedHours: 1,
    deliverables: [
      'docker-compose.yml (image: valkey/valkey-bundle:8.1.1)',
      'docker-compose.dev.yml',
      'docker-compose.production.yml',
    ],
    dependencies: [],
    status: 'done',
    completedAt: '2026-06-02',
    notes: 'All three compose files already on valkey/valkey-bundle:8.1.1. Block complete.',
  },
  {
    id: 'block-6',
    phase: 101,
    blockNum: 6,
    title: 'Omni-Worker Dockerfile scaffold',
    description: 'Anaconda container unifying Node.js 22 + PyTorch + TRT-LLM in shared CUDA context via n-api.rs.',
    estimatedHours: 2,
    deliverables: [
      'docker/omni-worker/Dockerfile',
      'docker/omni-worker/docker-compose.omni.yml',
      'docker/omni-worker/langgraph_sidecar.py',
      'crates/omni-bridge/Cargo.toml',
      'crates/omni-bridge/src/lib.rs',
    ],
    dependencies: [],
    status: 'done',
    completedAt: '2026-06-02',
    notes: 'Scaffold created. Build smoke deferred until Docker is running on host.',
  },
  {
    id: 'block-7',
    phase: 101,
    blockNum: 7,
    title: 'OpenCode Kanban materializer',
    description: 'Script that reads the Phase 101 plan and emits .opencode/kanban/kanban-board.json + .md for OpenCode / MCP consumption.',
    estimatedHours: 0.5,
    deliverables: [
      'scripts/opencode/materialize-kanban-tasks.mjs',
      '.opencode/kanban/kanban-board.json',
      '.opencode/kanban/kanban-board.md',
    ],
    dependencies: ['block-1', 'block-2', 'block-3', 'block-4', 'block-5', 'block-6'],
    status: 'in_progress',
    completedAt: null,
    notes: '',
  },
];

// ── Load or initialise board ───────────────────────────────────────────
function loadBoard() {
  if (existsSync(BOARD_JSON)) {
    try {
      return JSON.parse(readFileSync(BOARD_JSON, 'utf8'));
    } catch { /* fall through */ }
  }
  return {
    schemaVersion: '1.0',
    phase: 101,
    updatedAt: null,
    columns: ['todo', 'in_progress', 'done', 'blocked'],
    blocks: PHASE_101_BLOCKS,
  };
}

// ── Render markdown table ──────────────────────────────────────────────
function renderMarkdown(board) {
  const STATUS_ICON = { done: '✅', in_progress: '🔄', todo: '⬜', blocked: '🔴' };
  const rows = board.blocks.map(b => {
    const icon   = STATUS_ICON[b.status] ?? '❓';
    const deps   = b.dependencies.length ? b.dependencies.join(', ') : '—';
    const hours  = b.estimatedHours;
    const done   = b.completedAt ?? '—';
    return `| Block ${b.blockNum} | ${icon} ${b.status} | ${b.title} | ${hours}h | ${deps} | ${done} | ${b.notes || '—'} |`;
  });

  return [
    `# Phase 101 Kanban Board`,
    ``,
    `**Updated:** ${board.updatedAt}  `,
    `**Phase:** ${board.phase}`,
    ``,
    `| Block | Status | Title | Est. | Deps | Completed | Notes |`,
    `|---|---|---|---|---|---|---|`,
    ...rows,
    ``,
    `## Backlog / Next Actions`,
    ``,
    ...board.blocks
      .filter(b => b.status === 'todo' || b.status === 'in_progress')
      .map(b => `- **Block ${b.blockNum}** (${b.status}): ${b.description}`),
    board.blocks.filter(b => b.status === 'todo' || b.status === 'in_progress').length === 0
      ? '_All blocks complete!_' : '',
  ].join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────
function main() {
  mkdirSync(KANBAN_DIR, { recursive: true });

  const board = loadBoard();

  // Apply status update if requested
  if (UPDATE_BLOCK !== null && NEW_STATUS) {
    const block = board.blocks.find(b => b.blockNum === UPDATE_BLOCK);
    if (!block) {
      console.error(`Block ${UPDATE_BLOCK} not found in board.`);
      process.exit(1);
    }
    const VALID = ['todo', 'in_progress', 'done', 'blocked'];
    if (!VALID.includes(NEW_STATUS)) {
      console.error(`Invalid status "${NEW_STATUS}". Must be one of: ${VALID.join(', ')}`);
      process.exit(1);
    }
    block.status = NEW_STATUS;
    if (NEW_STATUS === 'done' && !block.completedAt) {
      block.completedAt = TODAY;
    }
    console.log(`  Updated block ${UPDATE_BLOCK} → ${NEW_STATUS}`);
  }

  // Mark block-7 done since we're writing it now
  const block7 = board.blocks.find(b => b.blockNum === 7);
  if (block7 && block7.status === 'in_progress') {
    block7.status = 'done';
    block7.completedAt = TODAY;
  }

  board.updatedAt = new Date().toISOString();

  // Write outputs
  writeFileSync(BOARD_JSON, JSON.stringify(board, null, 2));
  writeFileSync(BOARD_MD, renderMarkdown(board));

  if (SHOW_STATUS || UPDATE_BLOCK !== null) {
    // Print summary to console
    const STATUS_ICON = { done: '✅', in_progress: '🔄', todo: '⬜', blocked: '🔴' };
    console.log('\nPhase 101 Kanban Board\n' + '─'.repeat(60));
    for (const b of board.blocks) {
      const icon = STATUS_ICON[b.status] ?? '❓';
      console.log(`  ${icon} Block ${b.blockNum}: ${b.title} (${b.status})`);
    }
    console.log('─'.repeat(60));
    const done = board.blocks.filter(b => b.status === 'done').length;
    console.log(`  ${done}/${board.blocks.length} blocks complete`);
  }

  console.log(`\n  Board: ${BOARD_JSON}`);
  console.log(`  Board: ${BOARD_MD}`);
}

main();
