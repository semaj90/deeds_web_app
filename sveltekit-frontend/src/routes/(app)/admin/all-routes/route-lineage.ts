// ─────────────────────────────────────────────────────────
// Route Lineage & Field Normalization for /admin/all-routes
// Extracted from +page.server.ts because SvelteKit 2 forbids
// non-underscore function exports in +page.server.ts.
// ─────────────────────────────────────────────────────────

export type RouteNode = {
  id: string;
  path: string;
  url?: string;
  href?: string;
  file?: string;
  kind?: 'page' | 'layout' | 'server' | 'endpoint' | string;
  group?: string;
  status?: 'ok' | 'warning' | 'error';
  tags?: string[];
  category?: string;
  lastModified?: string;
  hasLoad?: boolean;
  hasActions?: boolean;
  hasAiImports?: boolean;
  errorCount?: number;
  warningCount?: number;
  infoCount?: number;
  lastErrorAt?: string;
  lastErrorMessage?: string;
  suggestionCount?: number;
  patchSuccessRate?: number;
  errorState?: 'healthy' | 'flaky' | 'broken';
  source?: 'route_ast_graph' | 'filesystem';
  lineageStatus?: 'PROVEN' | 'PARTIAL' | 'MISSING';
  astNodeId?: string | null;
};

export type RouteErrorCluster = {
  id: string;
  routeId: string;
  tool: 'svelte-check' | 'tsc' | 'vite' | 'drizzle' | 'custom' | string;
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | string;
  count: number;
  lastSeen?: string;
  file?: string;
  rawLogSnippet?: string;
};

export type ResolvedRouteFields =
  | {
      ok: true;
      rawPath: string;
      file: string | null;
      source: 'route_ast_graph';
      lineageStatus: 'PROVEN' | 'PARTIAL';
    }
  | {
      ok: false;
      reason: 'MISSING_ROUTE_PATH';
      astNode: Record<string, unknown>;
    };

export function resolveRouteFields(astNode: Record<string, unknown>): ResolvedRouteFields {
  const rawPath =
    typeof astNode?.routePath === 'string' && astNode.routePath.trim()
      ? astNode.routePath.trim()
      : typeof astNode?.path === 'string' && astNode.path.trim()
        ? astNode.path.trim()
        : null;

  const file =
    typeof astNode?.filePath === 'string' && astNode.filePath.trim()
      ? astNode.filePath.trim()
      : typeof astNode?.file === 'string' && astNode.file.trim()
        ? astNode.file.trim()
        : null;

  if (!rawPath) {
    return {
      ok: false,
      reason: 'MISSING_ROUTE_PATH',
      astNode,
    };
  }

  return {
    ok: true,
    rawPath,
    file,
    source: 'route_ast_graph',
    lineageStatus: file && typeof astNode?.id === 'string' ? 'PROVEN' : 'PARTIAL',
  };
}

export function astNodeToRouteNode(astNode: Record<string, unknown>): RouteNode | null {
  const resolved = resolveRouteFields(astNode);
  if (!resolved.ok) return null;

  const routePath = resolved.rawPath;
  const file = resolved.file ?? undefined;
  const nodeId =
    (astNode.id as string) ||
    routePath ||
    file ||
    `route:${routePath}`;

  // Parse SvelteKit route pattern to extract group from filePath or routePath
  const groupMatch = (file || routePath).match(/\(([^)]+)\)/);
  let group = groupMatch ? `(${groupMatch[1]})` : undefined;
  if (routePath === '/admin' || routePath.startsWith('/admin/')) group = '(admin)';
  else if (routePath === '/demos' || routePath.startsWith('/demos/')) group = '(demos)';
  else if (routePath.startsWith('/api/')) group = '(api)';

  // Infer kind from file extension, name, or astNode.kind
  const rawKind = (astNode.kind as string | undefined) ?? '';
  let kind: RouteNode['kind'] = 'page';
  if (rawKind === 'layout' || file?.includes('+layout')) kind = 'layout';
  else if (rawKind === 'page_server' || file?.includes('+page.server')) kind = 'server';
  else if (rawKind === 'endpoint' || file?.includes('+server') || file?.includes('api/')) kind = 'endpoint';

  // Build tags from file structure or keywords
  const tags: string[] = [];
  if (routePath.includes('cases')) tags.push('case');
  if (routePath.includes('evidence')) tags.push('evidence');
  if (routePath.includes('persons')) tags.push('person');
  if (routePath.includes('admin')) tags.push('admin');
  if (routePath.includes('demos')) tags.push('demo');
  if (routePath.includes('api')) tags.push('api');
  if (routePath.includes('yorha')) tags.push('yorha');
  if (astNode.hasAiImports) tags.push('ai');

  return {
    id: nodeId,
    path: routePath,
    href: routePath,
    file,
    kind,
    group,
    status: 'ok',
    tags: tags.length > 0 ? tags : undefined,
    category: group ? `Routes/${group}` : 'Routes/root',
    lastModified: astNode.lastModified as string | undefined,
    hasLoad:
      (astNode.hasLoad as boolean) ||
      rawKind === 'page_server' ||
      Boolean(file?.includes('+page.server') || file?.includes('+page.ts')),
    hasActions: (astNode.hasActions as boolean) ?? false,
    hasAiImports: (astNode.hasAiImports as boolean) ?? false,
    source: resolved.source,
    lineageStatus: resolved.lineageStatus,
    astNodeId: typeof astNode.id === 'string' ? astNode.id : null,
  };
}
