#!/usr/bin/env node
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

function findRepoRoot(startDir) {
  const current = path.resolve(startDir);
  return path.basename(current).toLowerCase() === 'sveltekit-frontend' ? path.dirname(current) : current;
}

const cwd = findRepoRoot(process.cwd());
const knowledgeDir = path.join(cwd, 'memory', 'knowledge');
const reportsDir = path.join(cwd, 'docs', 'reports');
const cardsPath = path.join(knowledgeDir, 'schema-indexer-contract-cards.jsonl');
const manifestPath = path.join(knowledgeDir, 'schema-indexer-contract-manifest.json');
const reportJsonPath = path.join(reportsDir, 'schema-indexer-contract-report.json');
const reportMdPath = path.join(reportsDir, 'schema-indexer-contract-report.md');

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

async function main() {
  if (!existsSync(cardsPath)) {
    console.error(`Missing cards file: ${cardsPath}`);
    process.exitCode = 1;
    return;
  }

  const cards = parseJsonl(await fs.readFile(cardsPath, 'utf8'));
  const manifest = existsSync(manifestPath) ? JSON.parse(await fs.readFile(manifestPath, 'utf8')) : null;
  const card = cards[0] ?? null;

  const report = {
    generatedAt: new Date().toISOString(),
    manifest,
    counts: {
      cards: cards.length,
      schemaFiles: manifest?.counts?.schemaFiles ?? 0,
      tables: manifest?.counts?.tables ?? 0,
      domains: manifest?.counts?.domains ?? 0,
    },
    card,
    coverage: {
      atlasOverlayPresent: existsSync(path.join(cwd, 'sveltekit-frontend', 'docs', 'atlas', 'feature-registry.json')),
      liveAtlasContract: true,
      schemaContractPresent: Boolean(card),
    },
    nextActions: [
      'Use the standalone schema-indexer contract as the MCP search anchor for schema-only work.',
      'Keep workspace-gap cards and schema contract cards in separate search lanes.',
      'Rebuild the contract after schema file or semantic indexer changes.',
    ],
  };

  await fs.mkdir(reportsDir, { recursive: true });
  await fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(
    reportMdPath,
    [
      '# Schema Indexer Contract',
      '',
      `Generated: ${report.generatedAt}`,
      '',
      '## Summary',
      `- cards: ${report.counts.cards}`,
      `- schema files: ${report.counts.schemaFiles}`,
      `- tables: ${report.counts.tables}`,
      `- domains: ${report.counts.domains}`,
      '',
      '## Coverage',
      `- atlas overlay present: ${report.coverage.atlasOverlayPresent}`,
      `- live atlas contract: ${report.coverage.liveAtlasContract}`,
      `- schema contract present: ${report.coverage.schemaContractPresent}`,
      '',
      '## Contract',
      card
        ? [
            `- cardId: ${card.cardId}`,
            `- redisKey: ${card.retrieval?.redisKey ?? '(none)'}`,
            `- qdrantPointId: ${card.retrieval?.qdrantPointId ?? '(none)'}`,
            `- sourceRefs: ${(card.sourceRefs ?? []).join(', ') || '(none)'}`,
            `- searchHints: ${(card.searchHints ?? []).join(' | ') || '(none)'}`,
          ].join('\n')
        : '- (no card found)',
      '',
      '## Next Actions',
      ...report.nextActions.map((step) => `- ${step}`),
      '',
    ].join('\n'),
    'utf8'
  );

  console.log(
    JSON.stringify(
      {
        cards_built: cards.length,
        schema_files: report.counts.schemaFiles,
        tables: report.counts.tables,
        domains: report.counts.domains,
        report_json: reportJsonPath,
        report_md: reportMdPath,
        next_exact_command: 'npm run knowledge:schema-indexer:refresh',
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(`[knowledge:schema-indexer:report] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
