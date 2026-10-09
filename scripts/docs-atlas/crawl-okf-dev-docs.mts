#!/usr/bin/env node
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import { z } from 'zod';
import { mergeOkfDevCorpusRowsV1, summarizeOkfDevCorpusRowsV1 } from './lib/okf-dev-corpus-merge-v1.mjs';
import { recoverOkfDevPartialPageV1 } from './lib/okf-dev-partial-page-recovery-v1.mjs';
import { publishOkfDevCorpusGenerationV1, resolveOkfDevPublishedCorpusV1, writeOkfCrawlFailureReceiptV1 } from './lib/okf-dev-publication-v1.mjs';
import { normalizeOkfDevSourceManifestV1, orderOkfDevFetchersV1 } from './lib/okf-dev-source-manifest-adapter-v1.mjs';

type ManifestSource = {
  source_id: string;
  title: string;
  kind: string;
  domain_class: string;
  focus_tags: string[];
  pages: string[];
  source_revision?: string;
  preferred_fetcher?: string;
  source_metadata?: Record<string, unknown>;
};

const OkfDevDomainClassEnum = z.enum([
  'documentation',
  'tool',
  'workflow',
  'agent',
  'database',
  'retrieval',
  'graph',
  'gpu',
  'cache',
  'configuration',
  'error_fixing',
  'other',
]);

const OkfDevCorpusEntrySchema = z.object({
  schema_version: z.literal('okf.dev.corpus.v1'),
  source_id: z.string().min(1),
  source_ref: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  domain_class: OkfDevDomainClassEnum,
  focus_tags: z.array(z.string().min(1)).default([]),
  llm_synthesis: z.string().min(1),
  llm_output: z.record(z.string(), z.unknown()).default({}),
  kanban: z.object({
    board: z.string().min(1),
    lane: z.string().min(1),
    status: z.string().min(1),
  }).default({ board: 'okf-dev', lane: 'backlog', status: 'open' }),
  taskboard: z.object({
    task_id: z.string().min(1),
    title: z.string().min(1),
    status: z.string().min(1),
  }).default({ task_id: 'okf-dev', title: 'OKF dev corpus', status: 'open' }),
  agentic_error_fixing: z.object({
    symptom: z.string().min(1),
    likely_fix: z.string().min(1),
    validation: z.string().min(1),
  }).default({
    symptom: 'docs ingestion gap',
    likely_fix: 'Use Firecrawl scrape with bounded manifest and schema validation',
    validation: 'Validate emitted corpus entry with Zod',
  }),
  canonical_api_recommendations: z.array(z.object({
    api: z.string().min(1),
    recommendation: z.string().min(1),
    rationale: z.string().min(1),
  })).default([]),
  content_hash: z.string().min(1),
  markdown_path: z.string().min(1),
  fetched_at: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const REPO_ROOT = resolve(process.cwd());
const args = process.argv.slice(2);
function argValue(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  return value ? resolve(REPO_ROOT, value) : fallback;
}

const MANIFEST_PATH = argValue('manifest', join(REPO_ROOT, 'docs/.okf/dev/manifest.json'));
const OUTPUT_ROOT = argValue('output-root', join(REPO_ROOT, 'docs/.okf/dev'));
const RAW_ROOT = join(OUTPUT_ROOT, 'raw');
const RECORDS_PATH = join(OUTPUT_ROOT, 'corpus.jsonl');
const INDEX_PATH = join(OUTPUT_ROOT, 'index.md');
const SUMMARY_PATH = join(OUTPUT_ROOT, 'summary.json');
const execFileAsync = promisify(execFile);

const dryRun = args.includes('--dry-run');
const append = args.includes('--append');
const sourceIdFilter = args.find((arg) => arg.startsWith('--source-id='))?.slice('--source-id='.length);
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Number.POSITIVE_INFINITY;
const crawlRunId = `${new Date().toISOString().replace(/[^0-9TZ]/g, '')}-${crypto.randomBytes(8).toString('hex')}`;
const crawlRunState: {
  selectedCount: number;
  stagedCount: number;
  validatedCount: number;
  demandSnapshotChecksum: string | null;
  allowlistChecksum: string | null;
  failedItems: Array<Record<string, unknown>>;
  currentPage: { source_id: string; url: string } | null;
} = {
  selectedCount: 0,
  stagedCount: 0,
  validatedCount: 0,
  demandSnapshotChecksum: null,
  allowlistChecksum: null,
  failedItems: [],
  currentPage: null,
};

function slugFromUrl(url: string): string {
  const parsed = new URL(url);
  const segments = parsed.pathname.split('/').filter(Boolean);
  const tail = segments.at(-1) ?? 'index';
  return [parsed.hostname, ...segments.slice(-2), tail]
    .join('-')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'index';
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function compress(text: string, maxLength = 900): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function classifyDomain(sourceId: string, title: string, markdown: string): string {
  const haystack = `${sourceId} ${title} ${markdown}`.toLowerCase();
  if (/qdrant|vector|embedding|search|rescore|oversampling/.test(haystack)) return 'database';
  if (/workflow|agent|mastra|langgraph|task|kanban|taskboard/.test(haystack)) return 'workflow';
  if (/acp|a2a|tool|opencode|mcp/.test(haystack)) return 'tool';
  if (/pagerank|graph|cagra|cugraph|cuvs/.test(haystack)) return 'graph';
  if (/redis|valkey|cache|centroid/.test(haystack)) return 'cache';
  if (/cuda|gpu|rapids|tensor|onnx/.test(haystack)) return 'gpu';
  if (/trpc|validator|procedure|schema/.test(haystack)) return 'configuration';
  return 'documentation';
}

function classifyFocusTags(markdown: string): string[] {
  const text = markdown.toLowerCase();
  const tags = new Set<string>();
  if (/synthesi|summary|synthesize/.test(text)) tags.add('llm_synthesis');
  if (/output|json|structured|schema/.test(text)) tags.add('llm_output');
  if (/kanban|board|lane/.test(text)) tags.add('kanban');
  if (/kanban|taskboard|workflow|agent/.test(text)) tags.add('taskboard');
  if (/error|fix|debug|repair|retry|validation/.test(text)) tags.add('agentic_error_fixing');
  if (/api|endpoint|procedure|query|recommended/.test(text)) tags.add('canonical_api_recommendations');
  return [...tags];
}

function buildRecommendations(sourceId: string, markdown: string) {
  const recommendations: Array<{ api: string; recommendation: string; rationale: string }> = [];
  const lower = markdown.toLowerCase();

  if (sourceId === 'qdrant' || /qdrant/.test(lower)) {
    recommendations.push({
      api: 'Qdrant query points / named vectors',
      recommendation: 'Use named vectors for logical lanes and keep oversampling/rescore on quantized search only.',
      rationale: 'The official docs separate vector spaces, quantization, and search-time rescoring.'
    });
  }
  if (sourceId === 'firecrawl' || /firecrawl/.test(lower)) {
    recommendations.push({
      api: 'Firecrawl /scrape',
      recommendation: 'Use /scrape for known official docs pages and /crawl only when you need site-wide discovery.',
      rationale: 'Firecrawl documents scrape, crawl, search, extract, and parse as distinct surfaces.'
    });
  }
  if (sourceId === 'mastra' || /workflow/.test(lower)) {
    recommendations.push({
      api: 'Mastra workflows',
      recommendation: 'Keep nodes bounded and side-effect free until the final validation boundary.',
      rationale: 'Workflow orchestration fits the taskboard / kanban style agentic error-fixing loop.'
    });
  }
  if (sourceId === 'trpc' || /trpc/.test(lower)) {
    recommendations.push({
      api: 'tRPC procedures + validators',
      recommendation: 'Validate every input with Zod and keep procedure contracts narrow.',
      rationale: 'The repo already treats validated procedures as the stable application boundary.'
    });
  }
  if (sourceId === 'opencode' || /opencode/.test(lower)) {
    recommendations.push({
      api: 'OpenCode models / tools',
      recommendation: 'Prefer explicit model/provider/tool configuration over implicit chat defaults.',
      rationale: 'The repo needs canonical API recommendations, not hidden prompt state.'
    });
  }
  if (sourceId === 'acp' || sourceId === 'a2a' || /agent/.test(lower)) {
    recommendations.push({
      api: 'Agent envelopes',
      recommendation: 'Use a bounded task envelope with stable evidence refs and a concise action list.',
      rationale: 'This keeps agentic error fixing inspectable and compatible with kanban/taskboard sync.'
    });
  }
  if (sourceId === 'rapids' || /cuvs|cugraph/.test(lower)) {
    recommendations.push({
      api: 'cuVS / cuGraph',
      recommendation: 'Treat GPU ANN and PageRank as optional acceleration lanes behind the same search contract.',
      rationale: 'This matches the repository rule that acceleration must not become the canonical store.'
    });
  }

  return recommendations;
}

async function fetchWithFirecrawl(url: string) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;

  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      onlyMainContent: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`firecrawl_http_${response.status}`);
  }

  const payload = await response.json() as any;
  const markdown = payload.markdown ?? payload.data?.markdown ?? payload.content ?? '';
  const title = payload.metadata?.title ?? payload.title ?? new URL(url).hostname;
  return {
    title,
    markdown,
    raw: payload,
  };
}

async function fetchWithFallback(url: string) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Deeds-OKF-Dev-Corpus/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`http_${response.status}`);
  }

  const html = await response.text();
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  const title = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;
  const markdown = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    title,
    markdown,
    raw: { source: 'fallback' },
  };
}

async function fetchWithBeautifulSoup(url: string) {
  const python = process.env.PYTHON_BIN || 'python';
  const script = join(REPO_ROOT, 'scripts/docs-atlas/fetch-beautifulsoup.py');
  const { stdout } = await execFileAsync(python, [script, url], {
    cwd: REPO_ROOT,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  const payload = JSON.parse(stdout.trim()) as Record<string, unknown>;
  if (payload.error) throw new Error(`beautifulsoup_${String(payload.error)}`);
  return {
    title: String(payload.title ?? new URL(url).hostname),
    markdown: String(payload.markdown ?? ''),
    raw: { source: 'beautifulsoup', ...payload },
  };
}

async function main() {
  if (!dryRun && !append && [RECORDS_PATH, INDEX_PATH, SUMMARY_PATH].some((path) => existsSync(path))) {
    throw new Error(`refusing_to_overwrite_existing_corpus:${OUTPUT_ROOT}`);
  }
  const manifestBytes = await readFile(MANIFEST_PATH);
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as { sources: ManifestSource[] };
  manifest.sources = normalizeOkfDevSourceManifestV1(manifest);
  const selectedSources = sourceIdFilter
    ? manifest.sources.filter((source) => source.source_id === sourceIdFilter)
    : manifest.sources;
  if (sourceIdFilter && selectedSources.length === 0) throw new Error(`manifest_source_not_found:${sourceIdFilter}`);
  const selectedPages = selectedSources.flatMap((source) => source.pages.map((url) => ({ source_id: source.source_id, url })));
  const boundedSelectedPages = Number.isFinite(limit) ? selectedPages.slice(0, limit) : selectedPages;
  crawlRunState.selectedCount = boundedSelectedPages.length;
  crawlRunState.allowlistChecksum = `sha256:${sha256(manifestBytes.toString('utf8'))}`;
  crawlRunState.demandSnapshotChecksum = `sha256:${sha256(JSON.stringify({
    schema: 'atlas.documentation-crawl-selection.v1',
    source_id_filter: sourceIdFilter ?? null,
    selected_pages: boundedSelectedPages,
  }))}`;
  let existingEntries: z.infer<typeof OkfDevCorpusEntrySchema>[] = [];
  const publishedCorpus = resolveOkfDevPublishedCorpusV1(OUTPUT_ROOT);
  const priorCorpusPath = publishedCorpus?.corpusPath ?? RECORDS_PATH;
  if (!dryRun && append && existsSync(priorCorpusPath)) {
    existingEntries = (await readFile(priorCorpusPath, 'utf8')).split(/\r?\n/).filter(Boolean)
      .map((line) => OkfDevCorpusEntrySchema.parse(JSON.parse(line)));
    mergeOkfDevCorpusRowsV1(existingEntries, []);
  }
  const newEntries: z.infer<typeof OkfDevCorpusEntrySchema>[] = [];
  const dryRunSummary: Record<string, { pages: number; domains: Record<string, number> }> = {};
  const maxPages = Number.isFinite(limit) ? limit : Number.POSITIVE_INFINITY;
  let processed = 0;

  await mkdir(RAW_ROOT, { recursive: true });
  await mkdir(OUTPUT_ROOT, { recursive: true });

  for (const source of selectedSources) {
    for (const url of source.pages) {
      if (processed >= maxPages) break;

      const slug = slugFromUrl(url);
      const sourceDir = join(RAW_ROOT, source.source_id);
      const rawPath = join(sourceDir, `${slug}.md`);
      const jsonPath = join(sourceDir, `${slug}.json`);
      const sourceRef = `${source.source_id}:${slug}`;
      const markdownPath = relative(REPO_ROOT, rawPath).replaceAll('\\', '/');
      crawlRunState.currentPage = { source_id: source.source_id, url };

      if (append && !dryRun) {
        const knownEntries = [...existingEntries, ...newEntries];
        const priorRef = knownEntries.find((entry) => entry.source_ref === sourceRef);
        if (priorRef) {
          if (priorRef.url !== url) throw new Error(`CORPUS_SOURCE_REF_CONFLICT:${sourceRef}`);
          processed += 1;
          crawlRunState.currentPage = null;
          continue;
        }
        if (knownEntries.some((entry) => entry.url === url)) throw new Error(`CORPUS_URL_CONFLICT:${url}`);
        const rawExists = existsSync(rawPath);
        const sidecarExists = existsSync(jsonPath);
        if (rawExists !== sidecarExists) throw new Error(`PARTIAL_PAGE_PAIR_INCOMPLETE:${sourceRef}`);
        if (rawExists && sidecarExists) {
          const sidecar = JSON.parse(await readFile(jsonPath, 'utf8')) as Record<string, unknown>;
          const recovered = OkfDevCorpusEntrySchema.parse(recoverOkfDevPartialPageV1({
            sidecar,
            markdown: await readFile(rawPath, 'utf8'),
            sourceId: source.source_id,
            sourceRef,
            url,
            markdownPath,
          }));
          mergeOkfDevCorpusRowsV1(knownEntries, [recovered]);
          newEntries.push(recovered);
          crawlRunState.stagedCount += 1;
          processed += 1;
          console.log(`[okf-dev] recovered verified partial page ${sourceRef}`);
          crawlRunState.currentPage = null;
          continue;
        }
      }

      if (dryRun) {
        console.log(`[dry-run] ${source.source_id} -> ${url}`);
        processed += 1;
        dryRunSummary[source.source_id] ??= { pages: 0, domains: {} };
        dryRunSummary[source.source_id].pages += 1;
        dryRunSummary[source.source_id].domains[source.domain_class] =
          (dryRunSummary[source.source_id].domains[source.domain_class] ?? 0) + 1;
        continue;
      }

      await mkdir(sourceDir, { recursive: true });

      const fetchAttempts: Array<Record<string, string>> = [];
      const attemptFetch = async (executor: string, operation: () => Promise<{ title: string; markdown: string; raw?: Record<string, unknown> } | null>) => {
        try {
          const result = await operation();
          if (!result) fetchAttempts.push({ executor, status: 'EMPTY_RESULT' });
          return result;
        } catch (error) {
          fetchAttempts.push({ executor, status: 'FAILED', error: error instanceof Error ? error.message.slice(0, 300) : 'UNKNOWN_ERROR' });
          return null;
        }
      };
      const fetchOperations: Record<string, () => Promise<{ title: string; markdown: string; raw?: Record<string, unknown> } | null>> = {
        FIRECRAWL: () => fetchWithFirecrawl(url),
        BEAUTIFULSOUP_HTTP: () => fetchWithBeautifulSoup(url),
        HTTP_FALLBACK: () => fetchWithFallback(url),
      };
      let fetched: { title: string; markdown: string; raw?: Record<string, unknown> } | null = null;
      let fetchedVia: string | null = null;
      for (const fetcher of orderOkfDevFetchersV1(source.preferred_fetcher)) {
        fetched = await attemptFetch(fetcher.toLowerCase(), fetchOperations[fetcher]);
        if (fetched) {
          fetchedVia = fetcher.toLowerCase();
          break;
        }
      }
      if (!fetched) {
        crawlRunState.failedItems.push({ source_id: source.source_id, url, category: 'FETCH_ALL_EXECUTORS_FAILED', attempts: fetchAttempts });
        throw new Error(`FETCH_ALL_EXECUTORS_FAILED:${source.source_id}:${url}`);
      }
      const markdown = fetched.markdown || '';
      const contentHash = sha256(markdown);
      const focusTags = [...new Set([...source.focus_tags, ...classifyFocusTags(markdown)])];
      const canonicalApiRecommendations = buildRecommendations(source.source_id, markdown);

      const entry = OkfDevCorpusEntrySchema.parse({
        schema_version: 'okf.dev.corpus.v1',
        source_id: source.source_id,
        source_ref: sourceRef,
        url,
        title: fetched.title,
        domain_class: source.domain_class,
        focus_tags: focusTags,
        llm_synthesis: 'No model synthesis was run. This record contains fetched page metadata and a bounded excerpt only.',
        llm_output: {
          source: fetched.raw?.source ?? 'firecrawl',
          title: fetched.title,
          markdown_excerpt: compress(markdown, 1200),
          metadata: fetched.raw?.metadata ?? {},
        },
        kanban: {
          board: 'okf-dev',
          lane: source.domain_class,
          status: 'open',
        },
        taskboard: {
          task_id: `okf-dev:${source.source_id}:${slug}`,
          title: fetched.title,
          status: 'open',
        },
        agentic_error_fixing: {
          symptom: 'documentation gap or drift',
          likely_fix: `Refresh ${source.title} from official source and reclassify the corpus entry.`,
          validation: 'Run the Zod schema against the emitted corpus record.',
        },
        canonical_api_recommendations: canonicalApiRecommendations,
        content_hash: contentHash,
        markdown_path: markdownPath,
        fetched_at: new Date().toISOString(),
        metadata: {
          kind: source.kind,
          source_id: source.source_id,
          source_title: source.title,
          source_revision: source.source_revision ?? null,
          source_manifest: source.source_metadata ?? null,
          preferred_fetcher: source.preferred_fetcher ?? null,
          fetched_via: fetched.raw?.source ?? fetchedVia,
          domain_classification: 'MANIFEST_SOURCE_HINT_UNREVIEWED',
          detected_domain_hint: classifyDomain(source.source_id, fetched.title, markdown),
          synthesis_status: 'NOT_RUN',
        },
      });

      await writeFile(rawPath, markdown, { encoding: 'utf8', flag: 'wx' });
      await writeFile(jsonPath, JSON.stringify({ ...entry, raw_path: entry.markdown_path }, null, 2), { encoding: 'utf8', flag: 'wx' });
      newEntries.push(entry);
      crawlRunState.stagedCount += 1;
      processed += 1;
      console.log(`[okf-dev] ${source.source_id} -> ${url}`);
      crawlRunState.currentPage = null;
    }
  }

  if (dryRun) {
    console.log(JSON.stringify({ manifest: MANIFEST_PATH, processed, summary: dryRunSummary }, null, 2));
    return;
  }

  const allEntries = mergeOkfDevCorpusRowsV1(existingEntries, newEntries);
  const summary = summarizeOkfDevCorpusRowsV1(allEntries);
  const indexLines = [
    '# OKF Dev Corpus',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    '## Sources',
    '',
  ];
  for (const [sourceId, value] of Object.entries(summary)) {
    indexLines.push(`- ${sourceId}: ${value.pages} pages`);
  }
  indexLines.push(
    '',
    '## Output',
    '',
    `- Corpus: \`${relative(REPO_ROOT, RECORDS_PATH).replaceAll('\\', '/')}\``,
    `- Raw markdown: \`${relative(REPO_ROOT, RAW_ROOT).replaceAll('\\', '/')}\``
  );
  const summaryArtifact = {
    schema_version: 'okf.dev.summary.v1',
    generated_at: new Date().toISOString(),
    manifest: MANIFEST_PATH,
    records: allEntries.length,
    summary,
  };
  const published = await publishOkfDevCorpusGenerationV1({
    output_root: OUTPUT_ROOT,
    artifact_root: REPO_ROOT,
    run_id: crawlRunId,
    demand_snapshot_checksum: crawlRunState.demandSnapshotChecksum!,
    allowlist_checksum: crawlRunState.allowlistChecksum!,
    selected_count: crawlRunState.selectedCount,
    allowed_pages: boundedSelectedPages,
    entries: allEntries,
    pages: await Promise.all(newEntries.map(async (entry) => ({
      source_id: entry.source_id,
      source_ref: entry.source_ref,
      url: entry.url,
      markdown_path: entry.markdown_path,
      entry,
    }))),
    retained_pages: existingEntries.map((entry) => ({
      source_id: entry.source_id,
      source_ref: entry.source_ref,
      url: entry.url,
      markdown_path: entry.markdown_path,
      entry,
    })),
    index_markdown: indexLines.join('\n'),
    summary: summaryArtifact,
    validate_entry: (entry: unknown) => OkfDevCorpusEntrySchema.parse(entry),
  });
  crawlRunState.validatedCount = published.counts.validated;
  console.log(`[okf-dev] ${append ? 'published merged' : 'published'} ${allEntries.length} records via ${join(OUTPUT_ROOT, 'published-current.json')}`);
}

main().catch(async (error) => {
  console.error('[okf-dev] crawl failed:', error);
  if (!dryRun) {
    const currentPage = crawlRunState.currentPage;
    if (crawlRunState.failedItems.length === 0) {
      crawlRunState.failedItems.push({
        ...(currentPage ?? {}),
        category: currentPage ? 'CRAWL_STEP_FAILED' : crawlRunState.stagedCount > crawlRunState.validatedCount ? 'PUBLICATION_FAILED' : 'CRAWL_RUN_FAILED',
        error: error instanceof Error ? error.message.slice(0, 500) : 'UNKNOWN_ERROR',
      });
    }
    await writeOkfCrawlFailureReceiptV1({
      receipt_root: join(REPO_ROOT, '.tmp/atlas/documentation-crawl-failures'),
      run_id: crawlRunId,
      demand_snapshot_checksum: crawlRunState.demandSnapshotChecksum,
      allowlist_checksum: crawlRunState.allowlistChecksum,
      selected_count: crawlRunState.selectedCount,
      staged_count: crawlRunState.stagedCount,
      validated_count: crawlRunState.validatedCount,
      failed_count: Math.max(1, crawlRunState.failedItems.length),
      failed_items: crawlRunState.failedItems,
      error_category: error instanceof Error ? error.message.split(':', 1)[0].slice(0, 120) : 'UNKNOWN_ERROR',
    }).catch((receiptError) => console.error('[okf-dev] failure receipt write failed:', receiptError));
  }
  process.exitCode = 1;
});
