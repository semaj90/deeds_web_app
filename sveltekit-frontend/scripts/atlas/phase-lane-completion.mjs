#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_JSON = path.join('.tmp','phase-lane-completion.json');
const OUT_REPORT = path.join('reports','phase-lane-completion.md');

async function exists(p){ try{ await fs.access(p); return true;}catch(e){return false;} }

async function statMtimeMs(p) {
  try {
    const stat = await fs.stat(p);
    return stat.mtimeMs ?? null;
  } catch {
    return null;
  }
}

async function readJsonlKeySet(p, key) {
  try {
    const text = await fs.readFile(p, 'utf8');
    const rows = text.split(/\r?\n/).filter(Boolean);
    const values = new Set();
    for (const line of rows) {
      try {
        const row = JSON.parse(line);
        const value = row?.[key];
        if (value !== undefined && value !== null && `${value}`.trim()) values.add(`${value}`);
      } catch {
        continue;
      }
    }
    return values;
  } catch {
    return null;
  }
}

const APP_ROOT = path.resolve(__dirname, '../../..');

async function classifyRefreshPromotion(pathValue, { exists: pathExists, generated = false, active = false, sourceMissing = false, sourcePath = null } = {}) {
  if (sourceMissing) return 'MISSING_SOURCE';
  if (!pathExists) return 'MISSING_SOURCE';
  if (active) return 'ALREADY_ACTIVE';
  if (sourcePath) {
    const [artifactMtime, sourceMtime] = await Promise.all([statMtimeMs(pathValue), statMtimeMs(sourcePath)]);
    if (artifactMtime !== null && sourceMtime !== null && sourceMtime > artifactMtime) {
      return 'STALE_NEEDS_REGEN';
    }
  }
  if (generated) return 'GENERATED_DO_NOT_PROMOTE';
  return 'READY_TO_PROMOTE';
}

async function classifyFreshness(outputPath, sourcePath) {
  const outputExists = await exists(outputPath);
  const sourceExists = await exists(sourcePath);
  if (!sourceExists) return 'MISSING_SOURCE';
  if (!outputExists) return 'MISSING_SOURCE';
  const [outputMtime, sourceMtime] = await Promise.all([statMtimeMs(outputPath), statMtimeMs(sourcePath)]);
  if (outputMtime !== null && sourceMtime !== null && sourceMtime > outputMtime) return 'STALE_NEEDS_REGEN';
  return 'READY_TO_PROMOTE';
}

async function run(){
  const files = {
    parent_atlas_cards: path.join('.tmp', 'parent-atlas-profile-cards.jsonl'),
    phase12_overlay: path.join('docs', 'atlas', 'feature-registry.json'),
    phase16_refresh_runner: path.join(APP_ROOT, 'scripts', 'atlas', 'sourceRef-first-parent-atlas-refresh.mjs'),
    phase16_refresh_report: path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-first-parent-atlas-refresh.md'),
    phase17_source: path.join(APP_ROOT, 'memory', 'knowledge', 'schema-indexer-contract-cards.jsonl'),
    phase17_output: path.join('.tmp','phase17-pytorch-features.jsonl'),
    phase17_report: path.join('reports','phase17-pytorch-feature-summary.md'),
    phase18: path.join('.tmp','phase18-xgboost-rerank.jsonl'),
    hot_keyword_clusters: path.join('.tmp', 'hot-keyword-clusters.json'),
    retrieval_loop_log: path.join('.tmp', 'atlas-retrieval-loop.jsonl')
  };
  const status = {};
  for(const k of Object.keys(files)){
    status[k] = { exists: await exists(files[k]), path: files[k] };
  }
  const phase17Status = await classifyFreshness(files.phase17_output, files.phase17_source);
  const phase18Input = files.phase17_output;
  const phase18Report = path.join('reports','phase18-xgboost-rerank-summary.md');
  const phase18Status = await classifyFreshness(files.phase18, phase18Input);
  const phase19Output = files.retrieval_loop_log;
  const phase19Source = files.phase18;
  const phase19Report = path.join('reports','phase19-retrieval-loop-seed.md');
  const phase19Status = await (async () => {
    const [outputExists, sourceExists] = await Promise.all([exists(phase19Output), exists(phase19Source)]);
    if (!sourceExists) return 'MISSING_SOURCE';
    if (!outputExists) return 'MISSING_SOURCE';
    const [phase18Ids, phase19Ids] = await Promise.all([
      readJsonlKeySet(phase19Source, 'card_id'),
      readJsonlKeySet(phase19Output, 'card_id'),
    ]);
    if (phase18Ids && phase19Ids) {
      let covered = true;
      for (const id of phase18Ids) {
        if (!phase19Ids.has(id)) {
          covered = false;
          break;
        }
      }
      if (covered) return 'READY_TO_PROMOTE';
    }
    const [outputMtime, sourceMtime] = await Promise.all([statMtimeMs(phase19Output), statMtimeMs(phase19Source)]);
    if (outputMtime !== null && sourceMtime !== null && sourceMtime > outputMtime) return 'STALE_NEEDS_REGEN';
    return 'READY_TO_PROMOTE';
  })();
  const refreshPromotionCandidates = [
    {
      id: 'phase16_refresh_runner',
      label: 'sourceRef-first parent atlas refresh runner',
      path: path.join(APP_ROOT, 'scripts', 'atlas', 'sourceRef-first-parent-atlas-refresh.mjs'),
      status: await classifyRefreshPromotion(path.join(APP_ROOT, 'scripts', 'atlas', 'sourceRef-first-parent-atlas-refresh.mjs'), {
        exists: await exists(path.join(APP_ROOT, 'scripts', 'atlas', 'sourceRef-first-parent-atlas-refresh.mjs')),
        sourcePath: path.join(APP_ROOT, 'scripts', 'atlas', 'sourceRef-first-parent-atlas-refresh.mjs'),
      }),
    },
    {
      id: 'phase16_refresh_report_md',
      label: 'sourceRef-first parent atlas refresh report',
      path: path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-first-parent-atlas-refresh.md'),
      status: await classifyRefreshPromotion(path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-first-parent-atlas-refresh.md'), {
        exists: await exists(path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-first-parent-atlas-refresh.md')),
        active: true,
        sourcePath: path.join(APP_ROOT, 'scripts', 'atlas', 'sourceRef-first-parent-atlas-refresh.mjs'),
      }),
    },
    {
      id: 'phase16_refresh_report_json',
      label: 'sourceRef-first parent atlas refresh report json',
      path: path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-first-parent-atlas-refresh.json'),
      status: await classifyRefreshPromotion(path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-first-parent-atlas-refresh.json'), {
        exists: await exists(path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-first-parent-atlas-refresh.json')),
        active: true,
        sourcePath: path.join(APP_ROOT, 'scripts', 'atlas', 'sourceRef-first-parent-atlas-refresh.mjs'),
      }),
    },
    {
      id: 'sourceRef_parent_join_dry_run_md',
      label: 'sourceRef parent join dry run',
      path: path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-parent-join-dry-run.md'),
      status: await classifyRefreshPromotion(path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-parent-join-dry-run.md'), { exists: await exists(path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-parent-join-dry-run.md')), generated: true }),
    },
    {
      id: 'sourceRef_parent_join_dry_run_json',
      label: 'sourceRef parent join dry run json',
      path: path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-parent-join-dry-run.json'),
      status: await classifyRefreshPromotion(path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-parent-join-dry-run.json'), { exists: await exists(path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-parent-join-dry-run.json')), generated: true }),
    },
    {
      id: 'sourceRef_parent_join_archive_plan_md',
      label: 'sourceRef parent join archive plan',
      path: path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-parent-join-archive-plan.md'),
      status: await classifyRefreshPromotion(path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-parent-join-archive-plan.md'), { exists: await exists(path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-parent-join-archive-plan.md')), generated: true }),
    },
    {
      id: 'sourceRef_parent_join_archive_plan_json',
      label: 'sourceRef parent join archive plan json',
      path: path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-parent-join-archive-plan.json'),
      status: await classifyRefreshPromotion(path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-parent-join-archive-plan.json'), { exists: await exists(path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-parent-join-archive-plan.json')), generated: true }),
    },
    {
      id: 'sourceRef_parent_join_archive_move_list_md',
      label: 'sourceRef parent join archive move list',
      path: path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-parent-join-archive-move-list.md'),
      status: await classifyRefreshPromotion(path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-parent-join-archive-move-list.md'), { exists: await exists(path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-parent-join-archive-move-list.md')), generated: true }),
    },
    {
      id: 'sourceRef_parent_join_archive_move_list_json',
      label: 'sourceRef parent join archive move list json',
      path: path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-parent-join-archive-move-list.json'),
      status: await classifyRefreshPromotion(path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-parent-join-archive-move-list.json'), { exists: await exists(path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-parent-join-archive-move-list.json')), generated: true }),
    },
    {
      id: 'sourceRef_atlas_join_inventory_md',
      label: 'sourceRef atlas join inventory',
      path: path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-atlas-join-inventory.md'),
      status: await classifyRefreshPromotion(path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-atlas-join-inventory.md'), { exists: await exists(path.join(APP_ROOT, 'docs', 'reports', 'sourceRef-atlas-join-inventory.md')), active: true }),
    },
    {
      id: 'offline_synthesis_mapreduce_duckdb_report_md',
      label: 'offline synthesis mapreduce duckdb report',
      path: path.join(APP_ROOT, 'docs', 'reports', 'offline-synthesis-mapreduce-duckdb-report.md'),
      status: await classifyRefreshPromotion(path.join(APP_ROOT, 'docs', 'reports', 'offline-synthesis-mapreduce-duckdb-report.md'), { exists: await exists(path.join(APP_ROOT, 'docs', 'reports', 'offline-synthesis-mapreduce-duckdb-report.md')), active: true }),
    },
  ];
  status.generated_at = new Date().toISOString();
  status.phase16_refresh_promotion = {
    marker: 'phase16_refresh_promotion',
    items: refreshPromotionCandidates,
  };
  status.phase17_workstation_artifact = {
    marker: 'phase17_workstation_artifact',
    source: files.phase17_source,
    output: files.phase17_output,
    report: files.phase17_report,
    status: phase17Status,
  };
  status.phase18_reranker_contract = {
    marker: 'phase18_reranker_contract',
    input: phase18Input,
    output: files.phase18,
    report: phase18Report,
    status: phase18Status,
  };
  status.phase19_retrieval_loop_seed = {
    marker: 'phase19_retrieval_loop_seed',
    input: phase19Source,
    output: phase19Output,
    report: phase19Report,
    status: phase19Status,
  };
  await fs.mkdir(path.dirname(OUT_JSON),{recursive:true});
  await fs.writeFile(OUT_JSON, JSON.stringify(status,null,2),'utf8');
  const lines = ['# Phase Lane Completion','',`generated_at: ${status.generated_at}`,'','## Status',''];
  for(const k of Object.keys(files)){
    lines.push(`- **${k}**: ${status[k].exists ? 'present' : 'missing'} — ${status[k].path}`);
  }
  lines.push('', '## Phase 16 Refresh Promotion', '');
  lines.push(`- marker: ${status.phase16_refresh_promotion.marker}`);
  for (const item of refreshPromotionCandidates) {
    lines.push(`- **${item.label}**: ${item.status} — ${item.path}`);
  }
  lines.push('', '## Phase 17 Workstation Artifact', '');
  lines.push(`- marker: ${status.phase17_workstation_artifact.marker}`);
  lines.push(`- source: ${status.phase17_workstation_artifact.source}`);
  lines.push(`- output: ${status.phase17_workstation_artifact.output}`);
  lines.push(`- report: ${status.phase17_workstation_artifact.report}`);
  lines.push(`- status: ${status.phase17_workstation_artifact.status}`);
  lines.push('', '## Phase 18 Reranker Contract', '');
  lines.push(`- marker: ${status.phase18_reranker_contract.marker}`);
  lines.push(`- input: ${status.phase18_reranker_contract.input}`);
  lines.push(`- output: ${status.phase18_reranker_contract.output}`);
  lines.push(`- report: ${status.phase18_reranker_contract.report}`);
  lines.push(`- status: ${status.phase18_reranker_contract.status}`);
  lines.push('', '## Phase 19 Retrieval Loop Seed', '');
  lines.push(`- marker: ${status.phase19_retrieval_loop_seed.marker}`);
  lines.push(`- input: ${status.phase19_retrieval_loop_seed.input}`);
  lines.push(`- output: ${status.phase19_retrieval_loop_seed.output}`);
  lines.push(`- report: ${status.phase19_retrieval_loop_seed.report}`);
  lines.push(`- status: ${status.phase19_retrieval_loop_seed.status}`);
  lines.push(
    '',
    'Next steps: keep the Phase 12 overlay aligned in `docs/atlas/feature-registry.json`, keep Phase 16 refresh promotion pointed at the canonical sourceRef-first join artifacts, regenerate Phase 17 only if its output is stale relative to memory/knowledge/schema-indexer-contract-cards.jsonl, regenerate Phase 18 only if its rerank output is stale relative to Phase 17, and regenerate Phase 19 only if its retrieval loop seed is stale relative to Phase 18.'
  );
  await fs.mkdir(path.dirname(OUT_REPORT),{recursive:true});
  await fs.writeFile(OUT_REPORT, lines.join('\n'),'utf8');
  console.log('wrote', OUT_JSON, OUT_REPORT);
}

run().catch(e=>{ console.error(e); process.exit(1); });
