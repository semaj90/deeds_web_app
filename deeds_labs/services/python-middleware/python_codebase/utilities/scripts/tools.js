import { promises as fsp } from 'fs';
import path from 'path';

const DEFAULT_SEARCH_API =
  'https://api.duckduckgo.com/?no_redirect=1&no_html=1&format=json&q=';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const AGENTIC_MODEL = process.env.AGENTIC_MODEL || 'gemma3-legal:latest';
const AGENTIC_TEMPERATURE = Number(process.env.AGENTIC_TEMPERATURE || '0.3');
const MAX_LOCAL_RESULTS = Number(process.env.LOCAL_SEARCH_LIMIT || 5);
const IGNORE_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  '.svelte-kit',
  'build',
  'dist',
  '.vite',
  '.cache',
  '__pycache__',
]);
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.svelte',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.mdx',
  '.txt',
  '.css',
  '.scss',
  '.html',
]);

async function httpFetch(...args) {
  if (typeof fetch !== 'undefined') {
    return fetch(...args);
  }
  const { default: nodeFetch } = await import('node-fetch');
  return nodeFetch(...args);
}

async function callOllama(prompt, system = '') {
  if (!OLLAMA_URL) {
    throw new Error('OLLAMA_URL not configured');
  }

  const response = await httpFetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: AGENTIC_MODEL,
      prompt,
      system,
      stream: false,
      options: { temperature: AGENTIC_TEMPERATURE },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Ollama request failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }

  const data = await response.json();
  return data.response || '';
}

export async function webSearch(query) {
  const searchEndpoint =
    process.env.DOCS_SEARCH_ENDPOINT || DEFAULT_SEARCH_API;

  try {
    const res = await httpFetch(
      `${searchEndpoint}${encodeURIComponent(query.trim())}`,
    );
    if (!res.ok) {
      throw new Error(`Search HTTP ${res.status}`);
    }
    const json = await res.json();
    const topics = Array.isArray(json.RelatedTopics)
      ? json.RelatedTopics
      : [];
    return topics
      .flatMap((topic) => {
        if (topic.Topics) {
          return topic.Topics;
        }
        return topic;
      })
      .filter((topic) => topic && topic.Text && topic.FirstURL)
      .slice(0, 5)
      .map((topic) => ({
        title: topic.Text,
        url: topic.FirstURL,
        snippet: topic.Text,
      }));
  } catch (error) {
    console.warn(
      `[tools.webSearch] DuckDuckGo request failed: ${error.message}`,
    );
    return [];
  }
}

function shouldInspectDirectory(dirName) {
  return !IGNORE_DIRECTORIES.has(dirName);
}

function isTextFile(filePath, stat) {
  if (stat.size > 512 * 1024) {
    return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

export async function localSearch(pattern, baseDir = 'sveltekit-frontend') {
  const results = [];
  const queue = [path.resolve(process.cwd(), baseDir)];
  const needle = pattern.toLowerCase();

  while (queue.length && results.length < MAX_LOCAL_RESULTS) {
    const current = queue.shift();
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch (error) {
      console.warn(
        `[tools.localSearch] Failed to read ${current}: ${error.message}`,
      );
      continue;
    }

    for (const entry of entries) {
      if (results.length >= MAX_LOCAL_RESULTS) {
        break;
      }

      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (shouldInspectDirectory(entry.name)) {
          queue.push(entryPath);
        }
        continue;
      }

      let stat;
      try {
        stat = await fsp.stat(entryPath);
      } catch {
        continue;
      }

      if (!isTextFile(entryPath, stat)) {
        continue;
      }

      try {
        const content = await fsp.readFile(entryPath, 'utf8');
        if (content.toLowerCase().includes(needle)) {
          results.push({
            file: entryPath,
            snippet: extractSnippet(content, needle, pattern),
          });
        }
      } catch (error) {
        console.warn(
          `[tools.localSearch] Failed to read ${entryPath}: ${error.message}`,
        );
      }
    }
  }

  return results;
}

function extractSnippet(content, needleLower, originalNeedle) {
  const lowerContent = content.toLowerCase();
  const index = lowerContent.indexOf(needleLower);
  if (index === -1) {
    return content.slice(0, 140);
  }
  const start = Math.max(0, index - 80);
  const end = Math.min(content.length, index + originalNeedle.length + 80);
  return content.slice(start, end).replace(/\s+/g, ' ');
}

export async function summarizeText(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }

  if (!OLLAMA_URL) {
    return trimmed.split(/\s+/).slice(0, 80).join(' ') + ' …';
  }

  try {
    return await callOllama(
      `Summarize the following content in at most 90 words:\n${trimmed}`,
      'You are a concise documentation assistant.',
    );
  } catch (error) {
    console.warn(
      `[tools.summarizeText] Ollama call failed: ${error.message}`,
    );
    return trimmed.split(/\s+/).slice(0, 80).join(' ') + ' …';
  }
}

export async function generateFix(errorCode, context) {
  const fallback = `Suggested fix for ${errorCode}\n// ${context
    .toString()
    .slice(0, 200)}`;

  if (!OLLAMA_URL) {
    return fallback;
  }

  try {
    return await callOllama(
      `TypeScript error ${errorCode} occurred with the following context:\n${context}\n\nProvide a specific code change that resolves the issue.`,
      'You are a senior TypeScript engineer who writes concise fixes.',
    );
  } catch (error) {
    console.warn(
      `[tools.generateFix] Ollama call failed: ${error.message}`,
    );
    return fallback;
  }
}
