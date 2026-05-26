#!/usr/bin/env node
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

function findRepoRoot(startDir) {
  const current = path.resolve(startDir);
  return path.basename(current).toLowerCase() === 'sveltekit-frontend'
    ? path.dirname(current)
    : current;
}

const cwd = findRepoRoot(process.cwd());
const knowledgeDir = path.join(cwd, 'memory', 'knowledge');
const reportsDir = path.join(cwd, 'docs', 'reports');
const cardsPath = path.join(knowledgeDir, 'index-gap-memory-cards.jsonl');
const embedsPath = path.join(knowledgeDir, 'index-gap-memory-cards.embeds.jsonl');
const qdrantPreviewPath = path.join(knowledgeDir, 'index-gap-memory-cards.qdrant-preview.jsonl');
const manifestPath = path.join(knowledgeDir, 'index-gap-memory-manifest.json');
const reportJsonPath = path.join(reportsDir, 'index-gap-memory-report.json');
const reportMdPath = path.join(reportsDir, 'index-gap-memory-report.md');

function parseJsonl(text) {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function uniq(values) {
  return [...new Set((values ?? []).filter((value) => typeof value === 'string' && value.trim().length > 0))];
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Indexed vs Untracked Local Atlas Memory Cards');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- cards: ${report.counts.cards}`);
  lines.push(`- embedded cards: ${report.counts.embeddedCards}`);
  lines.push(`- qdrant preview rows: ${report.counts.qdrantPreviewRows}`);
  lines.push(`- feature gap rows: ${report.counts.featureGapRows}`);
  lines.push(`- workspace gap cards: ${report.counts.workspaceGapCards}`);
  lines.push(`- tracked gaps: ${report.counts.trackedGaps}`);
  lines.push(`- untracked gaps: ${report.counts.untrackedGaps}`);
  lines.push(`- production_ready: ${report.counts.productionReady}`);
  lines.push(`- active: ${report.counts.active}`);
  lines.push(`- candidate_prune: ${report.counts.candidatePrune}`);
  lines.push(`- archive_to_deeds_lab: ${report.counts.archiveToDeedsLab}`);
  lines.push('');
  lines.push('## Coverage');
  lines.push(`- atlas overlay present: ${report.coverage.atlasOverlayPresent}`);
  lines.push(`- live atlas contract: ${report.coverage.liveAtlasContract}`);
  lines.push(`- indexed tracked matches: ${report.coverage.indexedTracked}`);
  lines.push(`- indexed refs: ${report.coverage.indexedRefs}`);
  lines.push(`- feature keys: ${report.coverage.indexedFeatureKeys}`);
  lines.push('');
  lines.push('## Top Cards');
  for (const card of report.cards.slice(0, 20)) {
    lines.push(`- [${card.lifecycle?.status ?? 'active'}] ${card.cardId} :: ${card.title}`);
    lines.push(`  - sourceRefs: ${uniq(card.sourceRefs ?? []).join(', ') || '(none)'}`);
    lines.push(`  - searchHints: ${Array.isArray(card.searchHints) ? card.searchHints.join(' | ') : '(none)'}`);
  }
  lines.push('');
  lines.push('## Next Actions');
  for (const step of report.nextActions) {
    lines.push(`- ${step}`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  if (!existsSync(cardsPath)) {
    console.error(`Missing cards file: ${cardsPath}`);
    process.exitCode = 1;
    return;
  }

  const cards = parseJsonl(await fs.readFile(cardsPath, 'utf8'));
  const embeds = existsSync(embedsPath) ? parseJsonl(await fs.readFile(embedsPath, 'utf8')) : [];
  const qdrantPreview = existsSync(qdrantPreviewPath) ? parseJsonl(await fs.readFile(qdrantPreviewPath, 'utf8')) : [];
  const manifest = existsSync(manifestPath) ? JSON.parse(await fs.readFile(manifestPath, 'utf8')) : null;

  const counts = cards.reduce(
    (acc, card) => {
      const status = String(card.lifecycle?.status ?? 'active');
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    },
    {
      active: 0,
      candidate_prune: 0,
      archive_to_deeds_lab: 0,
      production_ready: 0,
    }
  );

  const report = {
    generatedAt: new Date().toISOString(),
    manifest,
    counts: {
      cards: cards.length,
      embeddedCards: embeds.length,
      qdrantPreviewRows: qdrantPreview.length,
      featureGapRows: manifest?.counts?.featureGapRows ?? 0,
      workspaceGapCards: manifest?.counts?.workspaceGapCards ?? 0,
      trackedGaps: manifest?.git?.trackedGaps ?? 0,
      untrackedGaps: manifest?.git?.untrackedGaps ?? 0,
      productionReady: counts.production_ready,
      active: counts.active,
      candidatePrune: counts.candidate_prune,
      archiveToDeedsLab: counts.archive_to_deeds_lab,
    },
    coverage: {
      atlasOverlayPresent: Boolean(manifest?.indexedCoverage?.atlasOverlayPresent),
      liveAtlasContract: Boolean(manifest?.indexedCoverage?.liveAtlasContract),
      indexedTracked: manifest?.git?.indexedTracked ?? 0,
      indexedRefs: manifest?.indexedCoverage?.indexedRefs ?? 0,
      indexedFeatureKeys: manifest?.indexedCoverage?.indexedFeatureKeys ?? 0,
    },
    cards,
    embedsPreview: embeds.slice(0, 20),
    qdrantPreview: qdrantPreview.slice(0, 20),
    nextActions: [
      'Keep indexed-vs-untracked cards downstream from the canonical Postgres/Qdrant/Redis/ACE lanes.',
      'Promote only sourceRef-backed workspace gap cards.',
      'Keep backup and generated artifacts out of active atlas coverage.',
      'Use the embed preview as the target for later MCP search routing.',
    ],
  };

  await fs.mkdir(reportsDir, { recursive: true });
  await fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(reportMdPath, renderMarkdown(report), 'utf8');

  console.log(
    JSON.stringify(
      {
        cards_built: cards.length,
        embedded_cards: embeds.length,
        qdrant_preview_rows: qdrantPreview.length,
        report_json: reportJsonPath,
        report_md: reportMdPath,
        next_exact_command: 'npm run knowledge:index-gap:refresh',
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(`[knowledge:index-gap:report] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
