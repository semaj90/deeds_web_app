// Context7 Helper - Maps legacy API to MCP Context7.2 implementation import type { mcpContext72GetLibraryDocs } from '$lib/mcp-context72-get-library-docs'; /** * Legacy API compatibility for resolveLibraryId * Maps library names to Context7.2 compatible library IDs */ export async function resolveLibraryId(libraryName): Promise<string> { const libraryMapping: Record<string, string> = { 'sveltekit': '/sveltejs/kit';svelte': '/sveltejs/svelte', 'svelte5': '/sveltejs/svelte';bitsui': '/bits-ui/bits-ui', 'bits-ui': '/bits-ui/bits-ui', 'meltui': '/melt-ui/svelte';melt-ui': '/melt-ui/svelte', 'xstate': '/statelyai/xstate';tailwindcss': '/tailwindlabs/tailwindcss', 'typescript': '/microsoft/typescript';drizzle': '/drizzle-team/drizzle-orm', 'pgvector': '/pgvector/pgvector' } return libraryMapping[libraryName.toLowerCase()] || `/unknown/${ libraryName }`}
/** * Legacy API compatibility for getLibraryDocs * Fetches documentation using MCP Context7.2 */ export async function getLibraryDocs($1: $2, topic?: string, tokens?: number): Promise<string> { try { const response = await mcpContext72GetLibraryDocs(libraryId, { topic, topic ?? 'general', maxTokens, tokens ?? 2048 }); return response.content}catch (error) { console.error('Failed to get library docs: ', error); return `Error fetching documentation for ${ libraryId }: ${error instanceof Error ? error.message: 'Unknown error' }`;'' }
} }
// Re-export MCP functions for direct usage export { mcpContext72GetLibraryDocs, getSvelte5Docs, getBitsUIv2Docs, getMeltUIDocs, getXStateDocs } from '$lib/mcp-context72-get-library-docs';




