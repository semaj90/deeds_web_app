import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildIndexedSourcePacket } from '$lib/server/ace/indexed-source-packet.js';
import { ldrQuickSummary, searchLdrHistory, startLdrResearch, type LdrSource } from '$lib/server/analytics/ldr-client.js';
import { getFeatureDocumentEvidence, type FeatureDocumentEvidence } from './feature-document-evidence.js';
import { MASTER_FEATURE_MAP } from './master-feature-map.js';
import {
  normalizeFeatureSlug,
  resolvePreferredFeatureBundleDir,
  resolvePreferredFeatureNotePath,
  resolvePreferredFeatureNotesRoot,
  toPosixAbsolute,
} from './feature-document-paths.js';

export interface PopulateFeatureDocumentInput {
  featureId: string;
  query?: string;
  forceRefresh?: boolean;
  dryRun?: boolean;
  maxSources?: number;
  startResearchIfMissing?: boolean;
}

export interface PopulateFeatureDocumentResult {
  featureId: string;
  title: string;
  query: string;
  featureNotePath: string;
  docsDirectory: string;
  manifestPath: string;
  summaryMode: 'history' | 'quick_summary' | 'feature_seed';
  sourcesFound: number;
  packet: {
    status: 'built' | 'skipped' | 'failed';
    packetId?: string;
    mode?: 'indexed-identity' | 'source-fallback';
    error?: string;
  };
  evidenceBefore: FeatureDocumentEvidence;
  evidenceAfter: FeatureDocumentEvidence | null;
}

function cleanText(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

function quoteYaml(value: string): string {
  return JSON.stringify(value);
}

function yamlArray(values: string[]): string {
  return `[${values.map((value) => quoteYaml(value)).join(', ')}]`;
}

function buildFeatureQuery(featureId: string, title: string, intent: string): string {
  return cleanText([featureId, title, intent, 'official API docs architecture integration'].filter(Boolean).join(' '));
}

function classifySourceType(url: string): 'official_docs' | 'github_repo' | 'github_issue' | 'web_page' {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === 'github.com') {
      return parsed.pathname.includes('/issues/') ? 'github_issue' : 'github_repo';
    }
    if (
      host.endsWith('docs.rs') ||
      host.endsWith('readthedocs.io') ||
      host.includes('docs.') ||
      host.endsWith('svelte.dev') ||
      host.endsWith('sveltekit.io') ||
      host.endsWith('qdrant.tech') ||
      host.endsWith('redis.io') ||
      host.endsWith('postgresql.org')
    ) {
      return 'official_docs';
    }
  } catch {
    return 'web_page';
  }

  return 'web_page';
}

function dedupeSources(sources: LdrSource[], limit: number) {
  const seen = new Set<string>();
  const normalized: Array<{
    title: string;
    url: string;
    sourceType: 'official_docs' | 'github_repo' | 'github_issue' | 'web_page';
  }> = [];

  for (const source of sources) {
    const url = String(source.url ?? '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    normalized.push({
      title: String(source.title ?? url).trim() || url,
      url,
      sourceType: classifySourceType(url),
    });
    if (normalized.length >= limit) break;
  }

  return normalized;
}

function deriveSourceRef(featureNotePath: string): string {
  const posix = toPosixAbsolute(featureNotePath);
  const marker = '/docs/';
  const index = posix.lastIndexOf(marker);
  if (index >= 0) {
    return posix.slice(index + 1);
  }

  return path.posix.join('docs', 'features', path.posix.basename(posix));
}

function renderFeatureNote(args: {
  featureId: string;
  title: string;
  entryIntent: string;
  query: string;
  summary: string;
  officialDocs: Array<{ title: string; url: string; sourceType: string }>;
  services: string[];
  docs: string[];
  tests: string[];
  pathMapping: string[];
}) {
  const {
    featureId,
    title,
    entryIntent,
    query,
    summary,
    officialDocs,
    services,
    docs,
    tests,
    pathMapping,
  } = args;

  const officialDocList = officialDocs.length > 0
    ? officialDocs.map((doc) => `- [${doc.title}](${doc.url})`).join('\n')
    : '- No official documentation URLs captured yet. Seed via LDR or manual manifest update.';

  const anchorList = [...services, ...pathMapping].length > 0
    ? [...new Set([...services, ...pathMapping])].map((value) => `- \`${value}\``).join('\n')
    : '- No code anchors mapped yet.';

  return `---
featureId: ${quoteYaml(featureId)}
title: ${quoteYaml(title)}
status: "research"
keywords: ${yamlArray([featureId, title, ...entryIntent.split(/\s+/).slice(0, 6)].filter(Boolean))}
services: ${yamlArray(services)}
docs: ${yamlArray(docs)}
tests: ${yamlArray(tests)}
---

# ${title}

## Summary

${summary}

## Feature Intent

${entryIntent || 'Feature intent not yet documented in the master feature map.'}

## Research Query

\`${query}\`

## Official Docs

${officialDocList}

## Atlas Anchors

${anchorList}

## Notes

- This note was generated from Parent Atlas metadata plus LDR evidence.
- Keep \`manifest.json\` as the machine-readable source list and this file as the curated operator note.
`;
}

export async function populateFeatureDocuments(
  input: PopulateFeatureDocumentInput
): Promise<PopulateFeatureDocumentResult> {
  const featureId = String(input.featureId ?? '').trim();
  if (!featureId) {
    throw new Error('featureId is required');
  }

  const entry = MASTER_FEATURE_MAP[featureId];
  if (!entry) {
    throw new Error(`Unknown featureId: ${featureId}`);
  }

  const title = entry.name || featureId;
  const intent = entry.intent || '';
  const query = cleanText(input.query || buildFeatureQuery(featureId, title, intent));
  const evidenceBefore = await getFeatureDocumentEvidence(featureId);

  const history = await searchLdrHistory(query).catch(() => null);
  const quickSummary = history ? null : await ldrQuickSummary(query).catch(() => null);
  const summaryMode: PopulateFeatureDocumentResult['summaryMode'] = history
    ? 'history'
    : quickSummary
      ? 'quick_summary'
      : 'feature_seed';
  const summary = cleanText(
    history?.summary ||
      quickSummary ||
      `${title} is tracked in Parent Atlas as ${intent || 'an active feature surface'}.`
  );
  const officialDocs = dedupeSources(history?.sources ?? [], Math.min(Math.max(input.maxSources ?? 8, 1), 12));

  if (!history && input.startResearchIfMissing !== false) {
    startLdrResearch(query, { maxIterations: 3, searchEngines: ['searxng', 'wikipedia'] }).catch(() => {});
  }

  const notePath = resolvePreferredFeatureNotePath(featureId, typeof entry.params?.docRef === 'string' ? entry.params.docRef : null);
  const docsDirectory = resolvePreferredFeatureBundleDir(featureId);
  const manifestPath = path.join(docsDirectory, 'manifest.json');
  const sourceRef = deriveSourceRef(notePath);

  const noteBody = renderFeatureNote({
    featureId,
    title,
    entryIntent: intent,
    query,
    summary,
    officialDocs,
    services: [...(entry.pathMapping ?? []), ...(entry.evidence?.files ?? [])],
    docs: officialDocs.map((doc) => doc.url),
    tests: entry.evidence?.tests ?? [],
    pathMapping: entry.pathMapping ?? [],
  });

  const manifest = {
    featureId,
    title,
    officialDocs: officialDocs.map((doc) => ({
      title: doc.title,
      url: doc.url,
      sourceType: doc.sourceType,
      screenshotPaths: [],
      filePaths: [],
    })),
    storage: evidenceBefore.storage,
  };

  if (!input.dryRun) {
    await mkdir(resolvePreferredFeatureNotesRoot(), { recursive: true });
    await mkdir(docsDirectory, { recursive: true });
    await writeFile(notePath, `${noteBody.trim()}\n`, 'utf8');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  let packet: PopulateFeatureDocumentResult['packet'] = { status: 'skipped' };
  if (!input.dryRun) {
    try {
      const indexedPacket = await buildIndexedSourcePacket({
        sourceRef,
        query: title,
        featureId,
        forceRefresh: input.forceRefresh,
      });
      packet = {
        status: 'built',
        packetId: indexedPacket.packet.packet_id,
        mode: indexedPacket.mode,
      };
    } catch (error) {
      packet = {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const evidenceAfter = input.dryRun ? null : await getFeatureDocumentEvidence(featureId);

  return {
    featureId,
    title,
    query,
    featureNotePath: toPosixAbsolute(notePath),
    docsDirectory: toPosixAbsolute(docsDirectory),
    manifestPath: toPosixAbsolute(manifestPath),
    summaryMode,
    sourcesFound: officialDocs.length,
    packet,
    evidenceBefore,
    evidenceAfter,
  };
}
