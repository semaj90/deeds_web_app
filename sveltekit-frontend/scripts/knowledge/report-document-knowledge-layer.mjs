#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'node:fs';

function findRepoRoot(startDir) {
  const current = path.resolve(startDir);
  return path.basename(current).toLowerCase() === 'sveltekit-frontend'
    ? path.dirname(current)
    : current;
}

const cwd = findRepoRoot(process.cwd());
const knowledgeDir = path.join(cwd, 'memory', 'knowledge');
const cardsPath = path.join(knowledgeDir, 'document-knowledge-cards.langext.jsonl');
const manifestPath = path.join(knowledgeDir, 'document-knowledge-manifest.json');
const reportJsonPath = path.join(knowledgeDir, 'document-knowledge-report.json');
const reportMdPath = path.join(knowledgeDir, 'document-knowledge-report.md');

async function readJson(file) {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw);
}

async function readJsonl(file) {
  const raw = await fs.readFile(file, 'utf8');
  return raw
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
  return [...new Set(values.filter((v) => typeof v === 'string' && v.trim().length > 0))];
}

function hasStableSource(card) {
  return (card.sourceRefs ?? []).some(
    (ref) =>
      typeof ref === 'string' &&
      !ref.startsWith('EXTERNAL:') &&
      !ref.includes('.svelte-error-fixes-backup/') &&
      !ref.includes('deeds_labs/archived-dead-code/') &&
      !ref.includes('deeds_labs/dead-scripts/') &&
      !ref.includes('UNRESOLVED:')
  );
}

function classifyCard(card) {
  const refs = card.sourceRefs ?? [];
  const summary = `${card.title ?? ''} ${card.summary ?? ''}`.toLowerCase();
  const hasBackup = refs.some((ref) => String(ref).includes('.svelte-error-fixes-backup/'));
  const hasArchive = refs.some((ref) => String(ref).includes('deeds_labs/archived-'));
  const hasDead = refs.some((ref) => String(ref).includes('deeds_labs/dead-'));
  const hasUnresolved = refs.some((ref) => String(ref).includes('UNRESOLVED:'));
  const hasExternalOnly = refs.length > 0 && refs.every((ref) => String(ref).startsWith('EXTERNAL:'));
  const mentionsDeprecated =
    /deprecated|dead port|old launcher|experimental|fallback|backup|archive|unused/.test(summary);
  const mentionsProduction = /production|startup smoke|tests?|stable port|contract/.test(summary);

  if (hasArchive || hasDead || hasUnresolved || hasExternalOnly || hasBackup) {
    return {
      status: 'candidate_prune',
      reason: hasArchive
        ? 'archived source tree'
        : hasDead
          ? 'dead-code or dead-script source'
          : hasUnresolved
            ? 'unresolved source reference'
            : hasBackup
              ? 'backup-only source'
              : 'external-only source refs',
    };
  }

  if (/experimental|prototype|trial|cuda|rnn|cuvs|notebook/.test(summary)) {
    return {
      status: 'archive_to_deeds_lab',
      reason: 'experimental or research-oriented card',
    };
  }

  if (mentionsProduction && hasStableSource(card)) {
    return {
      status: 'production_ready',
      reason: 'stable source refs and production indicators',
    };
  }

  if (mentionsDeprecated) {
    return {
      status: 'candidate_prune',
      reason: 'deprecated or fallback-oriented summary',
    };
  }

  return {
    status: 'active',
    reason: 'no prune/archive signals',
  };
}

function buildGraphLinks(card, classification) {
  const links = [];
  if (classification.status === 'candidate_prune') {
    links.push({
      relation: 'archives_to',
      targetId: 'deeds_lab',
      reason: classification.reason,
    });
  }
  if (classification.status === 'production_ready') {
    links.push({
      relation: 'implements',
      targetId: 'production',
      reason: classification.reason,
    });
  }
  return links;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Document Knowledge Report');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- cards: ${report.counts.cards}`);
  lines.push(`- active: ${report.counts.active}`);
  lines.push(`- candidate_prune: ${report.counts.candidate_prune}`);
  lines.push(`- archive_to_deeds_lab: ${report.counts.archive_to_deeds_lab}`);
  lines.push(`- production_ready: ${report.counts.production_ready}`);
  lines.push('');
  lines.push('## Recommendations');
  for (const item of report.recommendations) {
    lines.push(`- [${item.lifecycle.status}] ${item.cardId} :: ${item.title}`);
    lines.push(`  - reason: ${item.lifecycle.reason}`);
    lines.push(`  - sourceRefs: ${item.sourceRefs.join(', ') || '(none)'}`);
  }
  lines.push('');
  lines.push('## Next Steps');
  for (const step of report.nextSteps) {
    lines.push(`- ${step}`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const cardsExist = await fs
    .access(cardsPath)
    .then(() => true)
    .catch(() => false);
  if (!cardsExist) {
    console.error(`Missing cards file: ${cardsPath}`);
    process.exitCode = 1;
    return;
  }

  const cards = await readJsonl(cardsPath);
  const manifest = await readJson(manifestPath).catch(() => null);
  const recommendations = cards.map((card) => {
    const lifecycle = classifyCard(card);
    return {
      cardId: card.cardId,
      kind: card.kind,
      title: card.title,
      summary: card.summary,
      sourceRefs: uniq(card.sourceRefs ?? []),
      featureLabels: uniq(card.featureLabels ?? []),
      clusterTags: uniq(card.clusterTags ?? []),
      lifecycle: {
        status: lifecycle.status,
        confidence: card.lifecycle?.confidence ?? 0.5,
        reason: lifecycle.reason,
      },
      graphLinks: buildGraphLinks(card, lifecycle),
      retrieval: card.retrieval ?? { embeddingModel: 'embeddinggemma:latest', embeddingDim: 768 },
    };
  });

  const counts = recommendations.reduce(
    (acc, item) => {
      acc[item.lifecycle.status] = (acc[item.lifecycle.status] ?? 0) + 1;
      return acc;
    },
    { active: 0, candidate_prune: 0, archive_to_deeds_lab: 0, production_ready: 0 }
  );

  const report = {
    generatedAt: new Date().toISOString(),
    manifest,
    counts: {
      cards: recommendations.length,
      ...counts,
    },
    recommendations,
    nextSteps: [
      'Review candidate_prune cards for deletion or replacement.',
      'Move archive_to_deeds_lab cards into deeds_lab only if they remain useful for reference.',
      'Keep production_ready cards in active atlas exports and startup smokes.',
      'Add embedding + Qdrant only after card classification stays stable across two refreshes.',
    ],
  };

  await fs.mkdir(knowledgeDir, { recursive: true });
  await fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(reportMdPath, renderMarkdown(report), 'utf8');

  console.log(
    JSON.stringify(
      {
        cards_built: recommendations.length,
        prune_candidates: counts.candidate_prune,
        archive_to_deeds_lab: counts.archive_to_deeds_lab,
        production_ready: counts.production_ready,
        reportJsonPath,
        reportMdPath,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 2;
});
