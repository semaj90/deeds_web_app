#!/usr/bin/env node
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';

type ManifestSource = {
  source_id: string;
  title: string;
  kind: string;
  domain_class: string;
  focus_tags: string[];
  pages: string[];
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
const MANIFEST_PATH = join(REPO_ROOT, 'docs/.okf/dev/manifest.json');
const OUTPUT_ROOT = join(REPO_ROOT, 'docs/.okf/dev');
const RAW_ROOT = join(OUTPUT_ROOT, 'raw');
const RECORDS_PATH = join(OUTPUT_ROOT, 'corpus.jsonl');
const INDEX_PATH = join(OUTPUT_ROOT, 'index.md');
const SUMMARY_PATH = join(OUTPUT_ROOT, 'summary.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Number.POSITIVE_INFINITY;

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

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as { sources: ManifestSource[] };
  const records: string[] = [];
  const summary: Record<string, { pages: number; domains: Record<string, number> }> = {};
  const maxPages = Number.isFinite(limit) ? limit : Number.POSITIVE_INFINITY;
  let processed = 0;

  await mkdir(RAW_ROOT, { recursive: true });
  await mkdir(OUTPUT_ROOT, { recursive: true });

  for (const source of manifest.sources) {
    summary[source.source_id] ??= { pages: 0, domains: {} };
    for (const url of source.pages) {
      if (processed >= maxPages) break;

      const slug = slugFromUrl(url);
      const sourceDir = join(RAW_ROOT, source.source_id);
      const rawPath = join(sourceDir, `${slug}.md`);
      const jsonPath = join(sourceDir, `${slug}.json`);

      if (dryRun) {
        console.log(`[dry-run] ${source.source_id} -> ${url}`);
        processed += 1;
        summary[source.source_id].pages += 1;
        summary[source.source_id].domains[source.domain_class] =
          (summary[source.source_id].domains[source.domain_class] ?? 0) + 1;
        continue;
      }

      await mkdir(sourceDir, { recursive: true });

      const fetched =
        (await fetchWithFirecrawl(url).catch(async () => await fetchWithFallback(url))) ??
        (await fetchWithFallback(url));
      const markdown = fetched.markdown || '';
      const contentHash = sha256(markdown);
      const focusTags = [...new Set([...source.focus_tags, ...classifyFocusTags(markdown)])];
      const canonicalApiRecommendations = buildRecommendations(source.source_id, markdown);

      const entry = OkfDevCorpusEntrySchema.parse({
        schema_version: 'okf.dev.corpus.v1',
        source_id: source.source_id,
        source_ref: `${source.source_id}:${slug}`,
        url,
        title: fetched.title,
        domain_class: classifyDomain(source.source_id, fetched.title, markdown),
        focus_tags: focusTags,
        llm_synthesis: compress(
          `This page documents ${fetched.title}. ${source.title} is classified as ${source.domain_class}. ${canonicalApiRecommendations[0]?.recommendation ?? 'No canonical recommendation inferred.'}`
        ),
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
        markdown_path: rawPath,
        fetched_at: new Date().toISOString(),
        metadata: {
          kind: source.kind,
          source_id: source.source_id,
          source_title: source.title,
          fetched_via: process.env.FIRECRAWL_API_KEY ? 'firecrawl' : 'fallback',
        },
      });

      await writeFile(rawPath, markdown, 'utf8');
      await writeFile(jsonPath, JSON.stringify({ ...entry, raw_path: rawPath }, null, 2), 'utf8');
      records.push(JSON.stringify(entry));
      processed += 1;
      summary[source.source_id].pages += 1;
      summary[source.source_id].domains[entry.domain_class] =
        (summary[source.source_id].domains[entry.domain_class] ?? 0) + 1;
      console.log(`[okf-dev] ${source.source_id} -> ${url}`);
    }
  }

  if (dryRun) {
    console.log(JSON.stringify({ manifest: MANIFEST_PATH, processed, summary }, null, 2));
    return;
  }

  await writeFile(RECORDS_PATH, `${records.join('\n')}\n`, 'utf8');

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
  indexLines.push('', '## Output', '', `- Corpus: \`${RECORDS_PATH}\``, `- Raw markdown: \`${RAW_ROOT}\``);
  await writeFile(INDEX_PATH, indexLines.join('\n'), 'utf8');
  await writeFile(
    SUMMARY_PATH,
    JSON.stringify(
      {
        schema_version: 'okf.dev.summary.v1',
        generated_at: new Date().toISOString(),
        manifest: MANIFEST_PATH,
        records: records.length,
        summary,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(`[okf-dev] wrote ${records.length} records to ${RECORDS_PATH}`);
}

main().catch((error) => {
  console.error('[okf-dev] crawl failed:', error);
  process.exitCode = 1;
});
