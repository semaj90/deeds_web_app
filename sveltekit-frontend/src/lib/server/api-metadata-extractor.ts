/**
 * Comprehensive Route Metadata Extractor
 * Scans ALL routes (API, pages, archived) for the /all-routes UI
 * Handles: +server.ts, +page.server.ts, +page.svelte, deeds_labs archives
 */

import fs from 'fs';
import path from 'path';

export interface RouteEndpoint {
  path: string;
  type: 'api' | 'page-server' | 'page' | 'archived';
  methods: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'load' | 'actions')[];
  category: string;
  description: string;
  filePath: string;
  absolutePath?: string;
  hasAuth: boolean;
  responseType: string | null;
  group: string; // (app), (dev), admin, api, etc.
}

export interface RouteCategory {
  name: string;
  count: number;
  endpoints: RouteEndpoint[];
}

export interface RouteStats {
  totalRoutes: number;
  activeRoutes: number;
  archivedRoutes: number;
  apiEndpoints: number;
  pageServers: number;
  pages: number;
  categories: number;
  methodCounts: {
    GET: number;
    POST: number;
    PUT: number;
    DELETE: number;
    PATCH: number;
    load: number;
    actions: number;
  };
  groupCounts: {
    app: number;
    dev: number;
    admin: number;
    api: number;
    other: number;
    archived: number;
  };
  authRequired: number;
  sse: number;
}

const ROUTES_DIR = path.join(process.cwd(), 'src', 'routes');
const DEEDS_LABS_DIR = path.join(process.cwd(), '..', 'deeds_labs');

/**
 * Extract HTTP methods from a +server.ts file
 */
function extractMethods(
  content: string,
  fileType: string
): ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'load' | 'actions')[] {
  const methods: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'load' | 'actions')[] = [];

  if (fileType === '+server.ts') {
    if (/export\s+(const|async\s+function)\s+GET/m.test(content)) methods.push('GET');
    if (/export\s+(const|async\s+function)\s+POST/m.test(content)) methods.push('POST');
    if (/export\s+(const|async\s+function)\s+PUT/m.test(content)) methods.push('PUT');
    if (/export\s+(const|async\s+function)\s+DELETE/m.test(content)) methods.push('DELETE');
    if (/export\s+(const|async\s+function)\s+PATCH/m.test(content)) methods.push('PATCH');
  } else if (fileType === '+page.server.ts') {
    if (/export\s+(const|async\s+function)\s+load/m.test(content)) methods.push('load');
    if (/export\s+(const|async\s+function)\s+actions/m.test(content)) methods.push('actions');
  } else if (fileType === '+page.svelte' || fileType === '+page.ts') {
    // +page.ts has client-side load
    if (fileType === '+page.ts' && /export\s+(const|async\s+function)\s+load/m.test(content)) {
      methods.push('load');
    }
  }

  return methods;
}

/**
 * Extract JSDoc description from file, or generate one from path + methods
 */
function extractDescription(content: string, urlPath?: string, methods?: string[]): string {
  // Try JSDoc first
  const jsdocMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)\n/);
  if (jsdocMatch) {
    const desc = jsdocMatch[1].trim();
    // Skip descriptions that just echo the method/path (e.g. "POST /api/foo")
    if (desc && !/^(GET|POST|PUT|DELETE|PATCH)\s+\//.test(desc) && desc.length > 5) {
      return desc;
    }
  }

  // Try single-line comment before first export
  const commentMatch = content.match(/\/\/\s*(.+?)\n\s*export\s+(const|async)/);
  if (commentMatch) {
    const desc = commentMatch[1].trim();
    if (desc && !/^(GET|POST|PUT|DELETE|PATCH)\s+\//.test(desc) && desc.length > 5) {
      return desc;
    }
  }

  // Generate smart description from path + methods
  if (urlPath) return generateDescription(urlPath, methods || []);

  return 'Route endpoint';
}

/**
 * Generate a human-readable description from route path and HTTP methods
 */
function generateDescription(urlPath: string, methods: string[]): string {
  // Strip leading /api/ for cleaner parsing
  const isApi = urlPath.startsWith('/api/');
  const cleanPath = urlPath.replace(/^\/api\//, '').replace(/^\//, '');
  const segments = cleanPath.split('/').filter((s) => s && !s.startsWith(':'));

  if (segments.length === 0) return 'Root endpoint';

  const resource = segments[0];
  const rest = segments.slice(1);
  const hasParam = urlPath.includes(':');

  // Known full-path descriptions (exact match on clean path minus params)
  const exactDescriptions: Record<string, string> = {
    'ace/summarize': 'ACE context engine — AI-powered summarization with 7 data sources',
    'acp/execute': 'ACP tool execution — run registered agentic tools',
    'acp/tools': 'ACP tool registry — list available agentic tools',
    'admin/agent/fix': 'Admin — trigger AI agent to auto-fix errors',
    'admin/knowledge': 'Admin — knowledge base management dashboard',
    'admin/qlora': 'Admin — QLoRA fine-tuning management',
    'admin/routes': 'Admin — route health monitoring data',
    'admin/routes/stream': 'Admin — real-time route health SSE stream',
    'admin/seed-knowledge': 'Admin — seed knowledge base with initial data',
    'agent/investigate': 'AI agent — autonomous code investigation',
    'agents/chat': 'AI agent chat — context-aware conversation',
    'ai/case-prediction': 'AI — predict case outcomes using evidence',
    'ai/case-scoring': 'AI — evidence-weighted case strength scoring',
    'ai/chat': 'AI chat — Ollama-powered conversation',
    'ai/feedback': 'AI feedback — store user ratings with JSONB metadata',
    'auth/login': 'Authentication — user login with session creation',
    'auth/logout': 'Authentication — session termination',
    'auth/session': 'Authentication — validate current session',
    'cache/invalidate': 'Cache — pattern-based multi-tier invalidation',
    'cache/stats': 'Cache — real-time Redis/Memory/LLM/Template statistics',
    cases: 'List and create legal cases',
    chat: 'Dual-format chat endpoint (SSE + JSON)',
    'chat/stream': 'Streaming AI chat via Server-Sent Events',
    citations: 'Legal citation management and search',
    'citations/collections': 'Citation collections — group and organize citations',
    'consolidation/status': 'Route consolidation migration status check',
    'dashboard/stats': 'Dashboard — parallel counts (cases, evidence, persons, citations)',
    embed: 'Generate 768-dim text embeddings via Ollama',
    'errors/summary': 'Error aggregation by file path from phase72 table',
    evidence: 'Evidence listing and management',
    'evidence/analysis': 'Evidence — entity extraction + forensic analysis',
    'evidence/realtime': 'Evidence — real-time SSE upload progress (8 stages)',
    'evidence/search': 'Evidence — dual RAG+KAG+DAG semantic search',
    'evidence/upload': 'Evidence — 8-stage upload pipeline (MinIO → embed → index)',
    'glossary/search': 'Legal glossary term search',
    'health/capabilities': 'System capabilities — Ollama, Qdrant, Postgres, Redis status',
    'health/qdrant': 'Qdrant vector DB health check and auto-repair',
    'indexing/trigger': 'Trigger content indexing pipeline',
    'internal/error-brain/runs': 'Error Brain — historical error fix tracking',
    'internal/error-brain/status': 'Error Brain — aggregate error statistics',
    'kb/search': 'Knowledge base semantic search',
    'mcp/tools': 'MCP — list available FastMCP agentic tools',
    'ollama/models': 'Ollama — list loaded AI models',
    'ollama/status': 'Ollama — server health and GPU status',
    persons: 'Persons of interest — listing with case associations',
    'rag/answer': 'RAG — generate AI answer with cited sources',
    'rag/search': 'RAG — vector similarity search via Qdrant + Ollama',
    'rag/validate': 'RAG — validate source relevance and trustworthiness',
    reports: 'Report listing and management',
    'reports/generate': 'Generate AI-powered legal reports via Ollama',
    'reports/generate-from-template': 'Generate report from cached template (98% faster)',
    'routes/events': 'Route health — real-time SSE monitoring stream',
    'routes/metadata': 'Route metadata — comprehensive endpoint inventory',
    'sse/chat': 'Chat via Server-Sent Events with context',
    'statutes/search': 'Legal statute search and lookup',
    'precedents/search': 'Legal precedent case law search',
    summarize: 'AI-powered document summarization',
    tags: 'Evidence tag listing and management',
    'tags/search': 'Tag search with embeddings across CouchDB + Qdrant + pgvector',
    'v1/evidence/analyze': 'API v1 — evidence analysis via Ollama',
    'vision/analyze': 'Vision — YOLO + VLM image analysis pipeline',
  };

  // Check exact path match (without params)
  const pathKey = segments.join('/');
  if (exactDescriptions[pathKey]) return exactDescriptions[pathKey];

  // Check partial matches (resource + first sub)
  if (rest.length > 0) {
    const partialKey = `${resource}/${rest[0]}`;
    if (exactDescriptions[partialKey]) {
      if (rest.length > 1) {
        const suffix = rest.slice(1).join(' ').replace(/-/g, ' ');
        return `${exactDescriptions[partialKey]} — ${suffix}`;
      }
      return exactDescriptions[partialKey];
    }
  }

  // Fallback: known resource + method-based description
  const resourceDescriptions: Record<string, string> = {
    cases: 'Case management',
    evidence: 'Evidence handling',
    citations: 'Citation management',
    reports: 'Report generation',
    chat: 'AI chat interface',
    rag: 'RAG search pipeline',
    health: 'System health check',
    ollama: 'Ollama LLM',
    embed: 'Text embeddings',
    auth: 'Authentication',
    persons: 'Persons of interest',
    tags: 'Tag management',
    analytics: 'Analytics and metrics',
    cache: 'Cache management',
    routes: 'Route monitoring',
    agents: 'AI agents',
    knowledge: 'Knowledge base',
    vision: 'Image analysis',
    admin: 'Admin panel',
    internal: 'Internal APIs',
    dashboard: 'Dashboard data',
    errors: 'Error tracking',
    indexing: 'Content indexing',
    tools: 'Developer tools',
  };

  const base = resourceDescriptions[resource] || resource.replace(/-/g, ' ');
  const suffix = rest.length > 0 ? ' — ' + rest.join(' ').replace(/-/g, ' ') : '';
  const paramHint = hasParam ? ' (by ID)' : '';

  // Add method verb
  if (methods.includes('load')) return `${base}${suffix} — page data loader`;
  if (methods.includes('actions')) return `${base}${suffix} — form handler`;
  if (methods.length === 1 && methods[0] === 'GET') return `${base}${suffix}${paramHint} — fetch`;
  if (methods.length === 1 && methods[0] === 'POST') return `${base}${suffix} — create/process`;
  if (methods.length === 1 && methods[0] === 'DELETE')
    return `${base}${suffix}${paramHint} — remove`;

  return `${base}${suffix}${paramHint}`;
}

/**
 * Check if endpoint requires authentication
 */
function hasAuthentication(content: string): boolean {
  return (
    content.includes('validateSession') ||
    content.includes('requireAuth') ||
    content.includes('event.locals.user')
  );
}

/**
 * Extract response type from code
 */
function extractResponseType(content: string): string | null {
  if (content.includes('return json(')) return 'application/json';
  if (content.includes('new Response') && content.includes('text/event-stream'))
    return 'text/event-stream';
  if (content.includes('new Response') && content.includes('text/html')) return 'text/html';
  return 'application/json'; // Default assumption
}

/**
 * Categorize endpoint by directory path
 */
function categorizeEndpoint(relativePath: string): string {
  const parts = relativePath
    .split('/')
    .filter((p) => p && !p.startsWith('(') && !p.startsWith('['));
  if (parts.length === 0) return 'Root';

  // Skip 'api' prefix — use the sub-category (e.g., api/cases → cases)
  const effectiveParts = parts[0] === 'api' && parts.length > 1 ? parts.slice(1) : parts;
  const category = effectiveParts[0];

  // Friendly names
  const categoryMap: Record<string, string> = {
    auth: 'Authentication',
    cases: 'Case Management',
    evidence: 'Evidence',
    chat: 'Chat & AI',
    ai: 'AI Services',
    admin: 'Admin',
    internal: 'Internal',
    health: 'System Health',
    analytics: 'Analytics',
    reports: 'Reports',
    citations: 'Citations',
    persons: 'Persons of Interest',
    rag: 'RAG & Search',
    embed: 'Embeddings',
    ollama: 'Ollama',
    ace: 'ACE Engine',
    acp: 'ACP Tools',
    kb: 'Knowledge Base',
    tags: 'Tags',
    routes: 'Route Health',
    cache: 'Cache',
    mcp: 'MCP',
    agents: 'Agents',
    phase72: 'Error Brain',
    phase82: 'Phase 82',
    consolidation: 'Consolidation',
    errors: 'Errors',
    dashboard: 'Dashboard',
    indexing: 'Indexing',
    vision: 'Vision',
    tools: 'Tools',
    sse: 'Server-Sent Events',
    stream: 'Streaming',
    knowledge: 'Knowledge',
    summarize: 'Summarization',
    v1: 'API v1',
    'couchdb-analytics': 'CouchDB Analytics',
    login: 'Login',
    'webgpu-similarity': 'WebGPU',
    studio: 'Studio',
    'rag-search': 'RAG Search',
    graph: 'Knowledge Graph',
    library: 'Legal Library',
    search: 'Search',
    system: 'System',
    'codebase-index': 'Codebase Index',
    codebase: 'Codebase',
    recommendations: 'Recommendations',
    gpu: 'GPU Compute',
    glossary: 'Legal Glossary',
    statutes: 'Statutes',
    precedents: 'Precedents',
    phase89: 'Phase 89 Fixes',
    'persons-of-interest': 'Persons of Interest',
    demos: 'Demos & Experiments',
    'legal-corpus': 'Legal Corpus',
    'command-center': 'Command Center',
    'analysis-center': 'Analysis Center',
    'active-cases': 'Active Cases',
    'evidence-library': 'Evidence Library',
    'global-search': 'Global Search',
    'system-configuration': 'System Config',
    terminal: 'Terminal',
    'all-routes': 'All Routes',
    'ai-dashboard': 'AI Dashboard',
    'gpu-evidence-graph': 'GPU Evidence Graph',
    cartridge: 'Cartridge System',
    topology: 'Topology',
    'error-brain': 'Error Brain',
    nlp: 'NLP',
    pipeline: 'Pipeline',
    push: 'Push Notifications',
    web: 'Web',
    yorha: 'YoRHa UI',
    documents: 'Documents',
    detective: 'Detective',
    engagement: 'Engagement',
    docs: 'Documentation',
    security: 'Security',
    'case-theory': 'Case Theory',
    'analyze-tag': 'Tag Analysis',
    synthesis: 'Synthesis',
    'analyze-file': 'File Analysis',
    agent: 'AI Agent',
    user: 'User',
    document: 'Document',
    worker: 'Worker',
    rabbitmq: 'RabbitMQ',
    qlora: 'QLoRA',
    infrastructure: 'Infrastructure',
    metrics: 'Metrics',
    ml: 'Machine Learning',
    'gpu-wasm-integration': 'GPU WASM',
    'ingest-constitution': 'Ingest',
    onboarding: 'Onboarding',
    'generate-cluster-summaries': 'Cluster Summaries',
    feedback: 'Feedback',
    ping: 'Ping',
    orchestrator: 'Orchestrator',
    investigate: 'Investigation',
    demo: 'Demos & Experiments',
    'dashboard-phase14': 'Dashboard',
    odin: 'Odin',
    test: 'Testing',
    'verify-drizzle': 'Drizzle Verify',
    'cache-demo': 'Cache Demo',
    'tts-demo': 'TTS Demo',
    'voice-chat-demo': 'Voice Chat Demo',
    'test-source-validation': 'Source Validation',
    'test-user-store': 'User Store Test',
    'legal-corpus-premium': 'Legal Corpus',
    register: 'Register',
  };

  return categoryMap[category] || category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * Extract group from path
 */
function extractGroup(relativePath: string): string {
  const groupMatch = relativePath.match(/^\(([^)]+)\)/);
  if (groupMatch) return `(${groupMatch[1]})`;

  if (relativePath.startsWith('api/')) return 'api';
  if (relativePath.startsWith('admin/')) return 'admin';

  return 'other';
}

/**
 * Convert file path to URL path
 */
function filePathToURLPath(relativePath: string): string {
  let urlPath = relativePath
    .replace(/\+server\.ts$/, '')
    .replace(/\+page\.server\.ts$/, '')
    .replace(/\+page\.ts$/, '')
    .replace(/\+page\.svelte$/, '')
    .replace(/\/$/, '')
    .replace(/\[([^\]]+)\]/g, ':$1'); // Convert [id] to :id

  // Remove route groups like (app)
  urlPath = urlPath.replace(/\([^)]+\)\//g, '');

  // Add leading slash
  if (!urlPath.startsWith('/')) {
    urlPath = '/' + urlPath;
  }

  // Root route special case
  if (urlPath === '/') {
    return '/';
  }

  return urlPath;
}

/**
 * Recursively scan directory for route files
 */
function scanDirectory(
  dir: string,
  baseDir: string,
  type: 'api' | 'page-server' | 'page' | 'archived',
  results: RouteEndpoint[] = [],
  filePattern: string = '+server.ts'
): RouteEndpoint[] {
  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and .git
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.svelte-kit') {
        continue;
      }
      // Recurse into subdirectories
      scanDirectory(fullPath, baseDir, type, results, filePattern);
    } else if (entry.name === filePattern) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const relativePath = path
          .relative(baseDir, fullPath)
          .replace(/\\/g, '/')
          .replace(`/${filePattern}`, '');

        const urlPath = filePathToURLPath(relativePath);
        const methods = extractMethods(content, filePattern);

        const endpoint: RouteEndpoint = {
          path: urlPath,
          type,
          methods,
          category: categorizeEndpoint(relativePath),
          description: extractDescription(content, urlPath, methods),
          filePath: path.relative(process.cwd(), fullPath).replace(/\\/g, '/'),
          absolutePath: fullPath.replace(/\\/g, '/'),
          hasAuth: hasAuthentication(content),
          responseType: extractResponseType(content),
          group: type === 'archived' ? 'archived' : extractGroup(relativePath),
        };

        results.push(endpoint);
      } catch (err) {
        // Silently skip files that can't be read
      }
    }
  }

  return results;
}

// In-memory cache to avoid repeated filesystem scans within the same request cycle
let _cachedEndpoints: { data: RouteEndpoint[]; includesArchived: boolean; ts: number } | null =
  null;
const CACHE_TTL = 30_000; // 30 seconds

/**
 * Get all route endpoints (active + archived) — cached to avoid redundant scans
 */
export function getAllRouteEndpoints(includeArchived: boolean = false): RouteEndpoint[] {
  // Return cache if fresh and scope matches
  if (
    _cachedEndpoints &&
    Date.now() - _cachedEndpoints.ts < CACHE_TTL &&
    (!includeArchived || _cachedEndpoints.includesArchived)
  ) {
    return includeArchived
      ? _cachedEndpoints.data
      : _cachedEndpoints.data.filter((e) => e.type !== 'archived');
  }

  try {
    const results: RouteEndpoint[] = [];

    // Scan active routes
    scanDirectory(ROUTES_DIR, ROUTES_DIR, 'api', results, '+server.ts');
    scanDirectory(ROUTES_DIR, ROUTES_DIR, 'page-server', results, '+page.server.ts');
    scanDirectory(ROUTES_DIR, ROUTES_DIR, 'page', results, '+page.svelte');

    // Always scan archived for cache completeness
    if (fs.existsSync(DEEDS_LABS_DIR)) {
      scanDirectory(DEEDS_LABS_DIR, DEEDS_LABS_DIR, 'archived', results, '+server.ts');
    }

    // Sort by path
    results.sort((a, b) => a.path.localeCompare(b.path));

    _cachedEndpoints = { data: results, includesArchived: true, ts: Date.now() };

    return includeArchived ? results : results.filter((e) => e.type !== 'archived');
  } catch (err) {
    console.error('[Route Scanner] Failed to scan routes:', err);
    return [];
  }
}

/**
 * Get only active API endpoints (for API Explorer)
 */
export function getActiveAPIEndpoints(precomputed?: RouteEndpoint[]): RouteEndpoint[] {
  return (precomputed ?? getAllRouteEndpoints(false)).filter((e) => e.type === 'api');
}

/**
 * Get only archived endpoints (for deeds_labs panel)
 */
export function getArchivedEndpoints(precomputed?: RouteEndpoint[]): RouteEndpoint[] {
  return (precomputed ?? getAllRouteEndpoints(true)).filter((e) => e.type === 'archived');
}

/**
 * Group endpoints by category
 */
export function getRoutesByCategory(
  includeArchived: boolean = false,
  precomputed?: RouteEndpoint[]
): RouteCategory[] {
  const endpoints = precomputed ?? getAllRouteEndpoints(includeArchived);
  const categoryMap = new Map<string, RouteEndpoint[]>();

  for (const endpoint of endpoints) {
    const existing = categoryMap.get(endpoint.category) || [];
    existing.push(endpoint);
    categoryMap.set(endpoint.category, existing);
  }

  const categories: RouteCategory[] = [];
  for (const [name, endpoints] of categoryMap) {
    categories.push({
      name,
      count: endpoints.length,
      endpoints,
    });
  }

  // Sort by count (descending)
  categories.sort((a, b) => b.count - a.count);

  return categories;
}

/**
 * Get comprehensive route statistics
 */
export function getRouteStats(precomputed?: RouteEndpoint[]): RouteStats {
  const allEndpoints = precomputed ?? getAllRouteEndpoints(true);
  const activeEndpoints = allEndpoints.filter((e) => e.type !== 'archived');
  const archivedEndpoints = allEndpoints.filter((e) => e.type === 'archived');

  return {
    totalRoutes: allEndpoints.length,
    activeRoutes: activeEndpoints.length,
    archivedRoutes: archivedEndpoints.length,
    apiEndpoints: allEndpoints.filter((e) => e.type === 'api').length,
    pageServers: allEndpoints.filter((e) => e.type === 'page-server').length,
    pages: allEndpoints.filter((e) => e.type === 'page').length,
    categories: getRoutesByCategory(true, allEndpoints).length,
    methodCounts: {
      GET: allEndpoints.filter((e) => e.methods.includes('GET')).length,
      POST: allEndpoints.filter((e) => e.methods.includes('POST')).length,
      PUT: allEndpoints.filter((e) => e.methods.includes('PUT')).length,
      DELETE: allEndpoints.filter((e) => e.methods.includes('DELETE')).length,
      PATCH: allEndpoints.filter((e) => e.methods.includes('PATCH')).length,
      load: allEndpoints.filter((e) => e.methods.includes('load')).length,
      actions: allEndpoints.filter((e) => e.methods.includes('actions')).length,
    },
    groupCounts: {
      app: activeEndpoints.filter((e) => e.group === '(app)').length,
      dev: activeEndpoints.filter((e) => e.group === '(dev)').length,
      admin: activeEndpoints.filter(
        (e) => e.group === 'admin' || (e.group === '(app)' && e.path.includes('/admin'))
      ).length,
      api: activeEndpoints.filter((e) => e.group === 'api').length,
      other: activeEndpoints.filter((e) => e.group === 'other').length,
      archived: archivedEndpoints.length,
    },
    authRequired: allEndpoints.filter((e) => e.hasAuth).length,
    sse: allEndpoints.filter((e) => e.responseType === 'text/event-stream').length,
  };
}
