#!/usr/bin/env node
/**
 * Route bounded RLM contextual-engineering prompt packets (openspec-rlm-context-prompts-v1.jsonl)
 * through the shared ACP/A2A 5-phase lane classifier without mutating any source or DB store.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { classifyLanePhaseForCandidate } from './lib/acp-a2a-lane-classifier-v1.mjs';

function inferKindFromDomains(proposedDomains = [], promptText = '') {
  const doms = new Set(proposedDomains);
  if (doms.has('database.postgresql')) return 'DATABASE_SCHEMA';
  if (doms.has('graph') || doms.has('gpu') || doms.has('retrieval')) return 'RETRIEVAL_OR_PROJECTION';
  if (doms.has('compiler') || doms.has('frontend.sveltekit')) return 'TYPECHECK_OR_SCHEMA';
  if (/stale|superseded|expired/i.test(promptText)) return 'LINEAGE_ADMISSION';
  return 'UNKNOWN';
}

export function routeRlmPromptsToErrorFixingV1(promptPackets) {
  const laneCounts = {};
  const routed = [];

  for (const pkt of promptPackets ?? []) {
    const kind = inferKindFromDomains(pkt.proposedDomains, pkt.boundedContextPrompt);
    const lane = classifyLanePhaseForCandidate(kind, pkt.boundedContextPrompt);
    laneCounts[lane.lanePhase] = (laneCounts[lane.lanePhase] ?? 0) + 1;
    routed.push({
      idempotencyKey: pkt.idempotencyKey,
      taskId: pkt.taskId,
      sourceRef: pkt.sourceRef,
      sourceSha256: pkt.sourceSha256,
      kind,
      ...lane,
      status: 'PROPOSED',
      canonicalAuthority: false,
      writesPerformed: false,
    });
  }

  return {
    schema: 'atlas.openspec-rlm-routed-kanban.v1',
    totalRouted: routed.length,
    laneCounts,
    routed,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd();
  const inPath = path.resolve(root, 'docs/reports/openspec-rlm-context-prompts-v1.jsonl');
  const outPath = path.resolve(root, 'docs/reports/openspec-rlm-routed-kanban-v1.json');
  const packets = fs
    .readFileSync(inPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
  const result = routeRlmPromptsToErrorFixingV1(packets);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(
    JSON.stringify(
      {
        schema: result.schema,
        totalRouted: result.totalRouted,
        laneCounts: result.laneCounts,
        reportPath: outPath,
        canonicalAuthority: false,
        writesPerformed: false,
      },
      null,
      2,
    ),
  );
}
