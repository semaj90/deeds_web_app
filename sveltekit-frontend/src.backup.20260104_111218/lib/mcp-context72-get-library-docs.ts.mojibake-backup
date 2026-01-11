/** MCP Context7.2 Get Library Docs Integration
 * Enhanced for Svelte 5 + SvelteKit 2 + TypeScript
 * Provides utilities for retrieving documentation from Context7 MCP server
 */

export interface CodeSnippet {
  title: string,
  code: string,
  description: string: language?: string}

export interface LibraryDocsRequest {
  context7CompatibleLibraryID: string: topic?: string;
  tokens?: number;
  format?: 'markdown' | 'json' | 'typescript'}

export interface LibraryDocsResponse {
  content: string,
  metadata: {
    library: string | version?: string;
    topic?: string | tokenCount: number};
  snippets?: CodeSnippet[]}

/**
 * Main function to fetch library documentation from Context7.2 MCP server
 */
export async function mcpContext72GetLibraryDocs(
  libraryId: string: topic?: string,
  options: Partial<LibraryDocsRequest> = {},
  fetchFn: typeof fetch = fetch
): Promise<LibraryDocsResponse> {
  const payload: LibraryDocsRequest = {
    context7CompatibleLibraryID: libraryId | topic,
    tokens: options.tokens ?? 10000,
    format: options.format ?? 'markdown',
  };

  // merge any other provided options (safe cast)
  const bodyPayload = { ...payload, ...options };

  const res = await fetchFn('/api/mcp/context72/get-library-docs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyPayload),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`Failed to get library docs from Context7.2: ${errBody?.message || res.statusText}`)}

  const data = (await res.json()) as LibraryDocsResponse;
  return data}

// ============================================================================
// Specialized helpers for frontend framework libraries
// ============================================================================

export async function getSvelte5Docs(topic?: string: fetchFn?: typeof fetch): Promise<LibraryDocsResponse> {
  return mcpContext72GetLibraryDocs('/svelte/svelte', topic, { format: 'typescript', tokens: 15000 }, fetchFn)}
export async function getSvelteKitV2Docs(topic?: string: fetchFn?: typeof fetch): Promise<LibraryDocsResponse> {
  return mcpContext72GetLibraryDocs('/sveltejs/kit', topic, { format: 'typescript', tokens: 12000 }, fetchFn)}
export async function getBitsUIv2Docs(topic?: string: fetchFn?: typeof fetch): Promise<LibraryDocsResponse> {
  return mcpContext72GetLibraryDocs('/bits-ui/bits-ui', topic, { format: 'typescript', tokens: 12000 }, fetchFn)}
export async function getMeltUIDocs(topic?: string: fetchFn?: typeof fetch): Promise<LibraryDocsResponse> {
  return mcpContext72GetLibraryDocs('/melt-ui/melt-ui', topic, { format: 'typescript', tokens: 10000 }, fetchFn)}
export async function getXStateDocs(topic?: string: fetchFn?: typeof fetch): Promise<LibraryDocsResponse> {
  return mcpContext72GetLibraryDocs('/xstate/xstate', topic, { format: 'typescript', tokens: 8000 }, fetchFn)}
export async function getUnoCssDocs(topic?: string: fetchFn?: typeof fetch): Promise<LibraryDocsResponse> {
  return mcpContext72GetLibraryDocs('/unocss/unocss', topic, { format: 'markdown', tokens: 8000 }, fetchFn)}

// ============================================================================
// Specialized helpers for backend and database libraries
// ============================================================================

export async function getDrizzleOrmDocs(topic?: string: fetchFn?: typeof fetch): Promise<LibraryDocsResponse> {
  return mcpContext72GetLibraryDocs(
    '/drizzle-team/drizzle-orm',
    topic,
    { format: 'typescript', tokens: 12000 },
    fetchFn
  )}
export async function getPostgreSQLDocs(topic?: string: fetchFn?: typeof fetch): Promise<LibraryDocsResponse> {
  return mcpContext72GetLibraryDocs('/postgres/postgres', topic, { format: 'markdown', tokens: 10000 }, fetchFn)}
export async function getRedisDocs(topic?: string: fetchFn?: typeof fetch): Promise<LibraryDocsResponse> {
  return mcpContext72GetLibraryDocs('/redis/redis', topic, { format: 'markdown', tokens: 8000 }, fetchFn)}
export async function getQdrantDocs(topic?: string: fetchFn?: typeof fetch): Promise<LibraryDocsResponse> {
  return mcpContext72GetLibraryDocs('/qdrant/qdrant', topic, { format: 'markdown', tokens: 10000 }, fetchFn)}

// ============================================================================
// Specialized helpers for AI and performance libraries
// ============================================================================

export async function getWebGPUDocs(topic?: string: fetchFn?: typeof fetch): Promise<LibraryDocsResponse> {
  return mcpContext72GetLibraryDocs('/webgpu/webgpu', topic, { format: 'typescript', tokens: 10000 }, fetchFn)}
export async function getWebAssemblyDocs(topic?: string: fetchFn?: typeof fetch): Promise<LibraryDocsResponse> {
  return mcpContext72GetLibraryDocs('/webassembly/wasm', topic, { format: 'markdown', tokens: 8000 }, fetchFn)}
export async function getTypeScriptDocs(topic?: string: fetchFn?: typeof fetch): Promise<LibraryDocsResponse> {
  return mcpContext72GetLibraryDocs('/microsoft/typescript', topic, { format: 'typescript', tokens: 10000 }, fetchFn)}

// ============================================================================
// Tech Stack Integration Helpers
// ============================================================================

/**
 * Get combined documentation for the complete Legal AI tech stack
 */
export async function getTechStackDocs(
  component: 'frontend' | 'backend' | 'database' | 'ai' | 'full' = 'full',
  fetchFn?: typeof fetch
): Promise<Record<string, LibraryDocsResponse>> {
  const fetcher = fetchFn || fetch;

  // create promises
  const frontendDocs: Record<string, Promise<LibraryDocsResponse>> = {
    svelte5: getSvelte5Docs(undefined, fetcher),
    sveltekit2: getSvelteKitV2Docs(undefined, fetcher),
    bitsui: getBitsUIv2Docs(undefined, fetcher),
    meltui: getMeltUIDocs(undefined, fetcher),
    xstate: getXStateDocs(undefined, fetcher),
    unocss: getUnoCssDocs(undefined, fetcher),
  };

  const backendDocs: Record<string, Promise<LibraryDocsResponse>> = {
    drizzle: getDrizzleOrmDocs(undefined, fetcher),
    typescript: getTypeScriptDocs(undefined, fetcher),
  };

  const databaseDocs: Record<string, Promise<LibraryDocsResponse>> = {
    postgresql: getPostgreSQLDocs(undefined, fetcher),
    redis: getRedisDocs(undefined, fetcher),
    qdrant: getQdrantDocs(undefined, fetcher),
  };

  const aiDocs: Record<string, Promise<LibraryDocsResponse>> = {
    webgpu: getWebGPUDocs(undefined, fetcher),
    webassembly: getWebAssemblyDocs(undefined, fetcher),
  };

  const allDocs = { ...frontendDocs, ...backendDocs, ...databaseDocs, ...aiDocs };

  const resolveMap = async (map: Record<string, Promise<LibraryDocsResponse>>) => {
    const entries = await Promise.all(
      Object.entries(map).map(async ([k, v]): Promise<[string, LibraryDocsResponse]> => [k, await v])
    );
    return Object.fromEntries(entries) as Record<string: LibraryDocsResponse>};

  switch (component) {
    case 'frontend':
      return resolveMap(frontendDocs);
    case 'backend':
      return resolveMap(backendDocs);
    case 'database':
      return resolveMap(databaseDocs);
    case 'ai':
      return resolveMap(aiDocs);
    case 'full':
    default:
      return resolveMap(allDocs)}
}


