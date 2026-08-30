import { ENV } from '$lib/server/env.server.js';
import { bifrostChat } from '$lib/server/ollama.js';

/**
 * CouchDB Client - Lightweight wrapper for ACE knowledge base
 */

function stripCredentials(url?: string | null): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.replace(/\/$/, '');
  }
}

const COUCHDB_URL = stripCredentials(ENV.COUCHDB_URL);

function authHeader(): string {
  // Extract from original URL if present, otherwise fallback to basic defaults
  try {
    const url = new URL(ENV.COUCHDB_URL);
    if (url.username && url.password) {
      return 'Basic ' + Buffer.from(url.username + ':' + url.password).toString('base64');
    }
  } catch { /* ignore */ }
  return '';
}

async function couchFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!COUCHDB_URL) {
    throw new Error('CouchDB URL is not configured');
  }

  const url = COUCHDB_URL + '/' + path.replace(/^\//, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> ?? {})
  };

  const auth = authHeader();
  if (auth && !headers['Authorization']) {
    headers['Authorization'] = auth;
  }

  return fetch(url, { ...init, headers });
}

export const couchdb = {
  async info(dbName: string): Promise<Record<string, unknown>> {
    const res = await couchFetch(dbName);
    if (!res.ok) throw new Error('CouchDB info failed: ' + res.status);
    return res.json();
  },

  async get(dbName: string, docId: string): Promise<Record<string, unknown>> {
    const res = await couchFetch(dbName + '/' + encodeURIComponent(docId));
    if (!res.ok) throw new Error('CouchDB get failed: ' + res.status);
    return res.json();
  },

  async put(dbName: string, docId: string, doc: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await couchFetch(dbName + '/' + encodeURIComponent(docId), {
      method: 'PUT',
      body: JSON.stringify(doc)
    });
    return res.json();
  },

  async post(dbName: string, doc: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await couchFetch(dbName, {
      method: 'POST',
      body: JSON.stringify(doc)
    });
    return res.json();
  },

  async allDocs(dbName: string, opts?: { include_docs?: boolean; limit?: number }): Promise<{
    total_rows: number;
    rows: Array<{ id: string; key: string; value: { rev: string }; doc?: Record<string, unknown> }>;
  }> {
    const params = new URLSearchParams();
    if (opts?.include_docs) params.set('include_docs', 'true');
    if (opts?.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    const res = await couchFetch(dbName + '/_all_docs' + (qs ? '?' + qs : ''));
    if (!res.ok) throw new Error('CouchDB allDocs failed: ' + res.status);
    return res.json();
  },

  async view(dbName: string, design: string, view: string, opts?: Record<string, string>): Promise<{
    total_rows: number;
    rows: Array<{ id: string; key: unknown; value: unknown; doc?: Record<string, unknown> }>;
  }> {
    const params = new URLSearchParams(opts);
    const qs = params.toString();
    const path = dbName + '/_design/' + design + '/_view/' + view + (qs ? '?' + qs : '');
    const res = await couchFetch(path);
    if (!res.ok) throw new Error('CouchDB view failed: ' + res.status);
    return res.json();
  },

  async createDb(dbName: string): Promise<boolean> {
    const res = await couchFetch(dbName, { method: 'PUT' });
    return res.ok || res.status === 412; // 412 = already exists
  }
};

/**
 * ACE LLM helper - generates summaries via llama-server :8090 for CouchDB documents.
 * Chat/synthesis goes through bifrostChat (llama-server), never Ollama — Ollama is
 * embeddings-only per the "Ollama vs llama-server Boundary" hard rule (CLAUDE.md).
 */
export const aceLLM = {
  async summarize(text: string, model = process.env.LLAMA_SERVER_MODEL ?? 'ornith-1.5-9b'): Promise<string> {
    try {
      return await bifrostChat(
        [{ role: 'user', content: 'Summarize the following content concisely:\n\n' + text.slice(0, 4000) }],
        model,
        { temperature: 0.3, maxTokens: 256 }
      );
    } catch {
      return '';
    }
  }
};
