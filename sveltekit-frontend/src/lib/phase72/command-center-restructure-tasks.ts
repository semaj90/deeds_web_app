/**
 * Phase 6/72 Restructuring Tasks for Command Center NES Modal
 *
 * These entries appear in the command center with labeled intent tags
 * for system consolidation, archive cleanup, and evidence grid unification.
 */

export const phase6_72_restructure_tasks = [
 // System Tab Tasks
 {
 id: 'api-consolidation',
 tab: 'system',
 title: 'API Consolidation',
 description:
 'Merge duplicated handlers under src/routes/api/yorha/**, api/ai/**, and api/rag/** into api/legal/… tree',
 intent: 'Reduce DTO drift and prepare for next ts-check sweep',
 phase: 14,
 priority: 'high',
 tags: ['api', 'consolidation', 'dto', 'typescript'],
 actions: [
 {
 label: 'Audit duplicate endpoints',
 command:
 'grep -r "export const POST" src/routes/api/yorha src/routes/api/ai src/routes/api/rag',
 expected: 'List of endpoints with shared DTOs',
 },
 {
 label: 'Map DTO dependencies',
 command: 'node scripts/analyze-dto-usage.mjs',
 expected: 'Dependency graph showing shared types',
 },
 {
 label: 'Merge into api/legal',
 command: 'node scripts/merge-api-routes.mjs --target api/legal --sources yorha,ai,rag',
 expected: 'Unified api/legal tree with feature flags',
 },
 ],
 validation: { command: 'npm run phase6:core',
 expectation: 'TypeScript check passes with reduced error count',
 },
 },
 {
 id: 'phase72-embeddings-active',
 tab: 'system',
 title: 'Phase 72 GPU Error Clustering',
 description:
 'GPU-accelerated error vectorization using embeddinggemma (384-d) or native LibTorch addon',
 intent: 'Cluster TypeScript/Svelte errors by semantic similarity instead of raw log spam',
 phase: 72,
 priority: 'active',
 tags: ['gpu', 'embeddings', 'clustering', 'phase72'],
 status: { addon_built: true,
 addon_path: 'build/Release/ast_error_vectorizer.node',
 fallback_model: 'embeddinggemma:latest',
 embedding_dimension: 384,
 database_ready: false, // Set to true after migration
 },
 actions: [
 {
 label: 'Apply database migration',
 command: 'psql -U postgres -d legal_ai_db -f drizzle/0013_phase72_embeddings.sql',
 expected: 'embedding vector(384) column added with IVFFlat index',
 },
 {
 label: 'Test error capture',
 command:
 'curl -X POST http://localhost:5173/api/phase72/capture-error -d \'{"file_path":"test.ts","message":"Property foo does not exist"}\'',
 expected: 'Error stored with embedding',
 },
 {
 label: 'Test similarity search',
 command:
 'curl -X POST http://localhost:5173/api/phase72/similar-errors -d \'{"message":"Property does not exist","threshold":0.85}\'',
 expected: 'List of similar errors with scores',
 },
 ],
 validation: { query: 'SELECT COUNT(*) FROM phase72_error WHERE embedding IS NOT NULL',
 expectation: 'All captured errors have embeddings (< 5% NULL rate)',
 },
 },
 {
 id: 'env-phase14-unified',
 tab: 'system',
 title: 'Phase 14 Environment Unification',
 description: 'Unified .env config for Ollama, PostgreSQL, Qdrant, auth, and Phase 72 flags',
 intent: 'Single source of truth for all service configurations',
 phase: 14,
 priority: 'complete',
 tags: ['env', 'config', 'phase14'],
 verified: { OLLAMA_URL: 'http://localhost:11434',
 DATABASE_URL: 'postgresql://legal_admin:*****@localhost:5434/legal_ai_db',
 QDRANT_URL: 'http://localhost:6333',
 AUTH_COOKIE_NAME: 'yorha_session',
 PHASE72_ENABLED: true,
 },
 },

 // Evidence Tab Tasks
 {
 id: 'evidence-grid-unify',
 tab: 'evidence',
 title: 'Evidence Grid Unification',
 description:
 'Retire RealTimeEvidenceGrid, keep only YoRHa EvidenceGrid after Svelte 5 stabilizes',
 intent: 'Cut Svelte warnings and build noise from duplicate components',
 phase: 6,
 priority: 'medium',
 tags: ['evidence', 'svelte5', 'components', 'cleanup'],
 components_affected: [
 'src/lib/components/evidence/RealTimeEvidenceGrid.svelte',
 'src/lib/components/evidence/EvidenceGrid.svelte',
 'src/lib/components/yorha/EvidenceGrid.svelte',
 ],
 actions: [
 {
 label: 'Audit component usage',
 command: 'grep -r "RealTimeEvidenceGrid\\|EvidenceGrid" src/routes',
 expected: 'List of pages importing these components',
 },
 {
 label: 'Migrate to YoRHa variant',
 command: 'node scripts/migrate-evidence-grids.mjs --target yorha',
 expected: 'All imports use src/lib/components/yorha/EvidenceGrid.svelte',
 },
 {
 label: 'Remove legacy components',
 command:
 'rm src/lib/components/evidence/RealTimeEvidenceGrid.svelte src/lib/components/evidence/EvidenceGrid.svelte',
 expected: 'Only YoRHa variant remains',
 },
 ],
 validation: { command: 'npm run check',
 expectation: 'Svelte check passes with reduced warning count',
 },
 },
 {
 id: 'archive-trimming',
 tab: 'evidence',
 title: 'Archive Route Cleanup',
 description: 'Move stale demos from src/routes/archive/** to /docs or markdown exports',
 intent: 'Stop inflating route manifest with dead demo pages',
 phase: 6,
 priority: 'medium',
 tags: ['archive', 'cleanup', 'routes'],
 archive_candidates: [
 'src/routes/archive/demo-*.svelte',
 'src/routes/archive/test-*.svelte',
 'src/routes/archive/legacy-*.svelte',
 ],
 actions: [
 {
 label: 'List archive routes',
 command:
 'Get-ChildItem -Recurse src/routes/archive -Filter "*.svelte" | Select-Object Name',
 expected: 'Enumeration of all archive routes',
 },
 {
 label: 'Export to markdown',
 command: 'node scripts/export-archive-routes.mjs --output docs/archived-demos',
 expected: 'Markdown files in docs/archived-demos/',
 },
 {
 label: 'Tag with intent',
 command: 'node scripts/tag-archive-intent.mjs',
 expected: 'Each route metadata includes archival reason',
 },
 {
 label: 'Remove from manifest',
 command: 'rm -r src/routes/archive/demo-* src/routes/archive/test-*',
 expected: 'Only reference/legacy routes remain',
 },
 ],
 validation: { command: 'npm run build -- --dry-run',
 expectation: 'Route manifest size reduced by >20%',
 },
 },

 // Routes Tab Tasks
 {
 id: 'route-consolidation-complete',
 tab: 'routes',
 title: 'Route Consolidation Complete',
 description: 'Removed /cases conflicts, unified API tree under /api/legal and /api/v1',
 intent: 'Eliminate SvelteKit manifest conflicts and noisy ts-check output',
 phase: 6,
 priority: 'complete',
 tags: ['routes', 'consolidation', 'sveltekit'],
 removed: ['src/routes/cases/**'],
 retained: [
 'src/routes/api/legal/**',
 'src/routes/api/v1/**',
 'src/routes/api/rag/**',
 'src/routes/api/ai/**',
 'src/routes/api/yorha/**',
 'src/routes/api/gpu-*/**',
 'src/routes/api/webgpu/**',
 'src/routes/routes/+page.server.ts',
 ],
 validation: { command: 'npm run build',
 expectation: 'No route manifest conflicts',
 },
 },
 {
 id: 'phase6-validation-active',
 tab: 'routes',
 title: 'Phase 6 TypeScript/Svelte Validation',
 description:
 'Continuous ts-check/svelte-check across unified /api, legal, RAG, GPU, archive segments',
 intent: 'Ensure consolidated route tree remains sound after changes',
 phase: 6,
 priority: 'active',
 tags: ['typescript', 'svelte5', 'validation', 'phase6'],
 checks: { typescript: 'npx tsc --noEmit --skipLibCheck',
 svelte: 'npx svelte-check --tsconfig tsconfig.json',
 core: 'npm run phase6:core',
 },
 auto_fix: { svelte5_syntax: 'node scripts/fix-svelte5-syntax.mjs',
 components_fixed: ['src/lib/components/yorha/**', 'src/lib/filters/**', 'src/lib/search/**'],
 },
 validation: { threshold: '< 100 TypeScript errors',
 current_status: 'Passing after route consolidation',
 },
 },
];

/**
 * Helper to format tasks for NES modal display
 */
export function formatTaskForModal(task: (typeof phase6_72_restructure_tasks)[number]) {
 return {
 id: task.id,
 title: task.title,
 badge: `Phase ${task.phase}`,
 priority: task.priority,
 intent: task.intent,
 tags: task.tags.map((t) => `[${t}]`).join(' '), actions:
 task.actions?.map((a) => ({
 label: a.label,
 command: a.command,
 expectation: a.expected,
 })) || [],
 validation: task.validation,
 };
}

/**
 * Group tasks by tab for command center
 */
export const tasksByTab = {
 system: phase6_72_restructure_tasks.filter((t) => t.tab === 'system', evidence: phase6_72_restructure_tasks.filter((t) => t.tab === 'evidence', routes: phase6_72_restructure_tasks.filter((t) => t.tab === 'routes'),
};

/**
 * Get tasks by priority
 */
export const tasksByPriority = {
 high: phase6_72_restructure_tasks.filter((t) => t.priority === 'high', medium: phase6_72_restructure_tasks.filter((t) => t.priority === 'medium', active: phase6_72_restructure_tasks.filter((t) => t.priority === 'active', complete: phase6_72_restructure_tasks.filter((t) => t.priority === 'complete'),
};


