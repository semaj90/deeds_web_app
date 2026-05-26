#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT = path.join(ROOT, 'docs', 'architecture', 'programming-docs-hub.md');

const TOPICS = [
  {
    id: 'bifrost',
    title: 'Bifrost',
    rgPattern: 'bifrost|bitfrost|default_request_timeout_in_seconds|network_config',
    urls: [
      'https://docs.getbifrost.ai/llms.txt',
      'https://docs.getbifrost.ai/quickstart/gateway/setting-up',
      'https://docs.getbifrost.ai/features/semantic-caching',
      'https://docs.getbifrost.ai/features/retries-and-fallbacks',
      'https://docs.getbifrost.ai/mcp/overview'
    ]
  },
  {
    id: 'firecrawl',
    title: 'Firecrawl',
    rgPattern: 'firecrawl|@mendable/firecrawl-js|FIRECRAWL_API_KEY',
    urls: ['https://docs.firecrawl.dev/llms.txt', 'https://docs.firecrawl.dev/']
  },
  {
    id: 'redis',
    title: 'Redis',
    rgPattern: 'redis|ioredis|redis-cli|RediSearch',
    urls: ['https://redis.io/docs/latest/']
  },
  {
    id: 'webgpu',
    title: 'WebGPU',
    rgPattern: 'webgpu|navigator\.gpu|wgsl',
    urls: [
      'https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API',
      'https://gpuweb.github.io/gpuweb/'
    ]
  },
  {
    id: 'cuda',
    title: 'CUDA',
    rgPattern: 'cuda|cublas|cudnn|nvcc',
    urls: ['https://docs.nvidia.com/cuda/']
  },
  {
    id: 'cuvs',
    title: 'cuVS',
    rgPattern: 'cuvs|raft',
    urls: ['https://docs.rapids.ai/api/cuvs/stable/']
  },
  {
    id: 'go',
    title: 'Go',
    rgPattern: 'go-service|\.go\b|golang|go\s+mod',
    urls: ['https://go.dev/doc/']
  },
  {
    id: 'drizzle-orm',
    title: 'Drizzle ORM',
    rgPattern: 'drizzle|drizzle-orm|drizzle-kit',
    urls: ['https://orm.drizzle.team/docs/overview']
  },
  {
    id: 'unocss',
    title: 'UnoCSS',
    rgPattern: 'unocss|presetUno|uno\.config|unocss\.config',
    urls: ['https://unocss.dev/']
  },
  {
    id: 'bits-ui',
    title: 'Bits UI',
    rgPattern: 'bits-ui|from \'bits-ui\'|from "bits-ui"',
    urls: ['https://bits-ui.com/docs/getting-started']
  },
  {
    id: 'shadcn-svelte',
    title: 'shadcn-svelte',
    rgPattern: 'shadcn-svelte|shadcn',
    urls: ['https://www.shadcn-svelte.com/docs']
  }
];

function cleanText(raw) {
  const noScripts = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return noScripts.replace(/\s+/g, ' ').trim();
}

function summarizeBody(body, maxChars = 800) {
  const text = cleanText(body);
  if (!text) return '(no extractable content)';
  return text.slice(0, maxChars);
}

function runRg(pattern) {
  const args = [
    '-n',
    '-i',
    '--max-count',
    '200',
    '--max-columns',
    '220',
    '--max-columns-preview',
    '--no-messages',
    '--glob',
    '!node_modules',
    '--glob',
    '!**/*.lock',
    '--glob',
    '!**/dist/**',
    pattern,
    'src',
    'scripts',
    'docs'
  ];
  const result = spawnSync('rg', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 10
  });

  if (result.error) {
    return [`rg error: ${result.error.message}`];
  }

  if (result.status !== 0 && !result.stdout.trim()) {
    return ['(no matches)'];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 40);
}

async function fetchDoc(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'deeds-docs-refresh/1.0',
        accept: 'text/html, text/plain, application/json;q=0.9, */*;q=0.8'
      }
    });
    const body = await res.text();
    return {
      url,
      ok: res.ok,
      status: res.status,
      summary: summarizeBody(body)
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: 'ERR',
      summary: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function renderTopic(topic, docs, matches) {
  const out = [];
  out.push(`## ${topic.title}`);
  out.push('');
  out.push('### Official/Reference Docs (latest fetch)');
  out.push('');
  for (const doc of docs) {
    out.push(`- ${doc.url}`);
    out.push(`  - status: ${doc.ok ? 'ok' : 'fail'} (${doc.status})`);
    out.push(`  - summary: ${doc.summary}`);
  }
  out.push('');
  out.push('### Repo rg mapping (top 40)');
  out.push('');
  for (const line of matches) {
    out.push(`- ${line}`);
  }
  out.push('');
  return out.join('\n');
}

async function main() {
  const lines = [];
  lines.push('# Programming Docs Hub (Web + rg)');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('This file is auto-generated by `scripts/docs/refresh-programming-docs-hub.mjs`.');
  lines.push('');
  lines.push('Method: web fetch for latest external docs + ripgrep mapping against local code.');
  lines.push('');

  for (const topic of TOPICS) {
    const [docs, matches] = await Promise.all([
      Promise.all(topic.urls.map((url) => fetchDoc(url))),
      Promise.resolve(runRg(topic.rgPattern))
    ]);
    lines.push(renderTopic(topic, docs, matches));
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
