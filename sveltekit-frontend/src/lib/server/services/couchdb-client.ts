import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';

/**
 * CouchDB Client - Lightweight wrapper for ACE knowledge base
 */

const COUCHDB_URL = ENV.COUCHDB_URL.replace(/\/$/, '');

function authHeader(): string {
  // Extract from URL if present, otherwise fallback to basic defaults
  try {
    const url = new URL(COUCHDB_URL);
    if (url.username && url.password) {
      return 'Basic ' + Buffer.from(url.username + ':' + url.password).toString('base64');
    }
  } catch { /* ignore */ }
  return ''; // Authorization header might be redundant if credentials are in the URL
}

async function couchFetch(path: string, init?: RequestInit): Promise<Response> {
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
 * ACE LLM helper - generates summaries via Ollama for CouchDB documents
 */
const OLLAMA_URL = ENV.OLLAMA_BASE_URL;

export const aceLLM = {
  async summarize(text: string, model = 'gemma4-legal:latest'): Promise<string> {
    try {
      const res = await ollamaFetch(OLLAMA_URL + '/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: 'Summarize the following content concisely:\n\n' + text.slice(0, 4000),
          stream: false,
          options: { temperature: 0.3, num_predict: 256 }
        })
      });
      if (!res.ok) return '';
      const data = await res.json() as { response?: string };
      return data.response ?? '';
    } catch {
      return '';
    }
  }
};
