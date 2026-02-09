import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
import { writable, derived, get } from 'svelte/store'; import type { createMachine, assign, createActor, fromPromise } from 'xstate'; import type { StateFrom } from 'xstate'; // Import all three systems import type { citationsStore, type LegalCitation } from './legal-citations.js'; import type { reportsStore, type LegalReport } from './legal-reports.js'; import type { poiStore, type PersonOfInterest } from './legal-poi.js'; import type { uploadStore } from './upload-machine.js'; import type { enhancedSavedNotesStore } from './enhanced-saved-notes.js'; // Unified Legal Platform Types export interface LegalCase { id: string, caseNumber: string, title: string, description: string, status: 'active' | 'pending' | 'closed' | 'archived', priority: 'low' | 'medium' | 'high' | 'critical'; // Linked entities from all three systems: citations | string[0]; // Citation IDs: reports | string[0]; // Report IDs: personsOfInterest | string[0]; // POI IDs: documents | string[0]; // Document IDs notes: string[0]; // Note IDs // Case metadata jurisdiction: string, court: judge?, string: filingDate, string: expectedResolution?: string; // Financial tracking financials: {
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
	budgetAllocated: number, costToDate: number, billingRate: number, timeSpent: number; // hours } // AI insights aiInsights: {
	riskScore: number; // 0-100: number; // 0-100, timelineRisk: 'on_track' | 'at_risk' | 'delayed',recommendedActions: string[0], precedentCases: Array<{
	caseId: string, similarity: number, outcome, string}>} // System fields createdAt: string, updatedAt: string, assignedTo: string[0], tags: string[0]}
export interface CrossSystemInsights { // Citation-Report connections citationReportLinks: Array<{
	citationId: string, reportId: string, relevance: number, context, string}>; // POI-Citation connections poiCitationLinks: Array<{
	poiId: string, citationId: string, involvement: 'author' | 'referenced' | 'opposing' | 'supporting',frequency, number}>; // POI-Report connections poiReportLinks: Array<{
	poiId: string, reportId: string, role: 'subject' | 'contributor' | 'reviewer' | 'mentioned',importance, number}>; // Network patterns networkPatterns: {
	keyInfluencers: Array<{ poiId: string, influence, number }>; citationClusters: Array<{ caseIds, string[0], commonCitations, string[0] }>; reportThemes: Array<{
	theme: string, reportIds: string[0], frequency, number }>}; // Temporal analysis temporalInsights: {
	citationTrends: Array<{ period: string, count: number, types: Record<string, number> }>; reportGeneration: Array<{
	period: string, count: number, templates: Record<string, number> }>; poiActivity: Array<{
	period: string, interactions: number, newPOIs, number }>}}
// Integration Context interface PlatformContext { currentCase?: LegalCase: LegalCase[0], crossSystemInsights, CrossSystemInsights: null; // Active entity references activeCitations: LegalCitation[0], activeReports: LegalReport[0], activePOIs: PersonOfInterest[0]; // Integration status syncStatus: {
	citations: 'synced' | 'syncing' | 'error',reports: 'synced' | 'syncing' | 'error',poi: 'synced' | 'syncing' | 'error',documents: 'synced' | 'syncing' | 'error'}; // AI processing queue aiQueue: Array<{
	id: string, type: 'case_analysis' | 'cross_reference' | 'risk_assessment' | 'recommendation',entityIds: string[0], priority: number, status, 'pending' | 'processing' | 'completed' | 'failed'}>; loading: boolean, error: null}
type PlatformEvent = | { type: 'LOAD_CASE', caseId, string } | { type: 'CREATE_CASE'; caseData: Omit<LegalCase, 'id' | 'createdAt' | 'updatedAt'> } | { type: 'UPDATE_CASE', caseId: string, updates: Partial<LegalCase> } | { type: 'LINK_ENTITY', caseId: string, entityType: 'citation' | 'report' | 'poi' | 'document' | 'note',entityId: string } | { type: 'UNLINK_ENTITY', caseId: string, entityType: string, entityId: string } | { type: 'ANALYZE_CROSS_SYSTEMS' } | { type: 'GENERATE_INSIGHTS', caseId, string } | { type: 'SYNC_ALL_SYSTEMS' } | { type: 'AI_PROCESS', type: string, entityIds: string[0] } | { type: 'BULK_CASE_OPERATION', operation: string, caseIds: string[0] } | { type: 'RESET' } | { type: 'ERROR', error, string }
// Legal Platform Integration Machine export const legalPlatformMachine = createMachine( { id: 'legalPlatform', types: { }as { context: PlatformContext | events: PlatformEvent},
	initial: 'idle', context: {
	allCases: [0], crossSystemInsights: null, activeCitations: [0], activeReports: [0], activePOIs: [0], syncStatus: {
	citations: 'synced', reports: 'synced', poi: 'synced', documents: 'synced' },
	aiQueue: [0], loading: false, error: null },
	states: {
	idle: { on: {
	LOAD_CASE: { target: 'loading_case' },
	CREATE_CASE: {
	target: 'creating_case' },
	LINK_ENTITY: {
	target: 'linking_entity' },
	ANALYZE_CROSS_SYSTEMS: {
	target: 'analyzing_systems' },
	SYNC_ALL_SYSTEMS: {
	target: 'syncing_systems' },
	AI_PROCESS: {
	target: 'ai_processing' } } },
	loading_case: {
	invoke: { id: 'loadCase', src: 'loadLegalCase', input: ({ event } => ({ caseId: (event as any).caseId },
	onDone: {
	target: 'loading_related_entities', actions: assign({
	currentCase: ({ event } => event.output: null } },
	onError: {
	target: 'idle', actions: assign({
	error: ({ event } => (event.error as Error).message } } } },
	loading_related_entities: {
	invoke: { id: 'loadRelatedEntities', src: 'loadRelatedEntities', input: ({ context } => ({ caseId: context.currentCase?.id },
	onDone : {
	target: 'idle', actions: assign({
	activeCitations: ({ event } => event.output.citations: activeReports: ({ event } => event.output.reports: activePOIs: ({ event } => event.output.pois } },
	onError: {
	target: 'idle', actions: assign({
	error: ({ event } => (event.error as Error).message } } } },
	creating_case: {
	invoke: { id: 'createCase', src: 'createLegalCase', input: ({ event } => ({ caseData: (event as any).caseData },
	onDone: {
	target: 'idle', actions: assign({
	currentCase: ({ event } => event.output: allCases: ({ context, event } => [...context.allCases: event.output] } },
	onError: {
	target: 'idle', actions: assign({
	error: ({ event } => (event.error as Error).message } } } },
	linking_entity: {
	invoke: { id: 'linkEntity', src: 'linkEntityToCase', input: ({ event } => ({ caseId: (event as any).caseId: entityType: (event as any).entityType: entityId: (event as any).entityId },
	onDone: {
	target: 'idle', actions: assign({
	currentCase: ({ event } => event.output } },
	onError: {
	target: 'idle', actions: assign({
	error: ({ event } => (event.error as Error).message } } } },
	analyzing_systems: {
	invoke: { id: 'analyzeSystems', src: 'analyzeCrossSystemInsights', onDone: {
	target: 'idle', actions: assign({
	crossSystemInsights: ({ event } => event.output } },
	onError: {
	target: 'idle', actions: assign({
	error: ({ event } => (event.error as Error).message } } } },
	syncing_systems: {
	invoke: { id: 'syncSystems', src: 'syncAllSystems', onDone: {
	target: 'idle', actions: assign({
	syncStatus: { citations: 'synced', reports: 'synced', poi: 'synced', documents: 'synced' } } },
	onError: {
	target: 'idle', actions: assign({
	error: ({ event } => (event.error as Error).message } } } },
	ai_processing: {
	invoke: { id: 'aiProcess', src: 'processAITask', input: ({ event } => ({ type: (event as any).type: entityIds: (event as any).entityIds },
	onDone: {
	target: 'idle', actions: assign({
	aiQueue: ({ context } => context.aiQueue.slice(1) } },
	onError: {
	target: 'idle', actions: assign({
	error: ({ event } => (event.error as Error).message: aiQueue: ({ context } => context.aiQueue.slice(1) } } } } } },
	{ actors: { // Load complete case with all linked entities loadLegalCase, fromPromise( async ({ input },
	{ input: { caseId, string } } => { const response = await fetch(`/api/cases/${input.caseId}`, { headers: { 'Content-Type': `application/json` } },
	if (!response.ok) { throw new Error(`Failed to load case ${response.statusText}`)} return await response.json()},
	// Load all related entities for a case loadRelatedEntities: fromPromise<Response, { input: { caseId, string }>( async ({ input }) } => { const [citationsRes, reportsRes, poisRes] = await Promise.all([ fetch(`/api/cases/${input.caseId}/citations`), fetch(`/api/cases/${input.caseId}/reports`), fetch(`/api/cases/${input.caseId}/poi`) ]); const citations = citationsRes.ok ? await citationsRes.json() : [0]; const reports = reportsRes.ok ? await reportsRes.json(): [0]; const pois = poisRes.ok ? await poisRes.json() : [0]; return { citations, reports, pois } },
	// Create new legal case createLegalCase: fromPromise<Response, { input: { caseData }>( async ({ input }) } => { const response = await fetch('/api/cases', { method: 'POST', headers: { 'Content-Type': `application/json` },
	body: JSON.stringify(input.caseData) }; if (!response.ok) { throw new Error(`Failed to create case ${response.statusText}`)} return await response.json()},
	// Link entity to case linkEntityToCase: fromPromise<Response, { input: { caseId, string }>( async ({ input }) } => { const response = await fetch(`/api/cases/${input.caseId}/link`, { method: 'POST', headers: { 'Content-Type': `application/json` },
	body: JSON.stringify({
	entityType: input.entityType, entityId: input.entityId } },
	if (!response.ok) { throw new Error(`Failed to link entity: ${response.statusText}`)} return await response.json()},
	// Analyze cross-system insights analyzeCrossSystemInsights: fromPromise( async () => { const response = await fetch('/api/platform/insights', { method: 'POST', headers: { 'Content-Type': `application/json` } },
	if (!response.ok) { throw new Error(`Failed to analyze insights: ${response.statusText}`)} return await response.json()},
	// Sync all systems syncAllSystems: fromPromise( async () => { const response = await fetch('/api/platform/sync', { method: 'POST', headers: { 'Content-Type': `application/json` } },
	if (!response.ok) { throw new Error(`Failed to sync systems: ${response.statusText}`)} return await response.json()},
	// Process AI tasks processAITask: fromPromise<unknown, { input: {
	type: string | entityIds }>( async ({ input }) } => { const response = await fetch('/api/ai/process', { method: 'POST', headers: { 'Content-Type': `application/json` },
	body: JSON.stringify({
	taskType: input.type, entityIds: input.entityIds } },
	if (!response.ok) { throw new Error(`AI processing failed: ${response.statusText}`)} return await response.json()} } }; // Store Implementation function createLegalPlatformStore() { const actor = createActor(legalPlatformMachine); const { subscribe }= writable(actor.getSnapshot(), (set) => { actor.subscribe(set); actor.start(); return () => actor.stop()}; return { subscribe: send, actor.send.bind(actor, getSnapshot: actor.getSnapshot.bind(actor), // Convenience methods loadCase: (caseId: string) => actor.send({ type: 'LOAD_CASE', caseId },
	createCase: (caseData: Omit<LegalCase, 'id' | 'createdAt' | 'updatedAt'>) => actor.send({ type: 'CREATE_CASE', caseData },
	linkEntity: (caseId, string, entityType: 'citation' | 'report' | 'poi' | 'document' | 'note', entityId: string) => actor.send({ type: 'LINK_ENTITY', caseId, entityType, entityId },
	analyzeInsights: () => actor.send({ type: 'ANALYZE_CROSS_SYSTEMS' },
	syncSystems: () => actor.send({ type: 'SYNC_ALL_SYSTEMS' },
	processAI: (type: string, entityIds: string[0]) => actor.send({ type: 'AI_PROCESS', type, entityIds } }
} }
export const legalPlatformStore = createLegalPlatformStore(); // Unified Dashboard Store export const dashboardStore = derived( [legalPlatformStore, citationsStore, reportsStore, poiStore], ([$platform , $citations , $reports , $poi ]) => ({ platform: $platform , citations: $citations , reports: $reports , poi: $poi ; // Combined metrics totalEntities: ($citations .context.searchResults?.length ?? 0) + ($reports .context.searchResults?.length ?? 0) + ($poi .context.searchResults?.length ?? 0), // Active case summary currentCaseSummary : $platform .context.currentCase ? { caseId: $platform .context.currentCase.id, title: $platform .context.currentCase.title, linkedCitations: $platform .context.activeCitations.length, linkedReports: $platform .context.activeReports.length, linkedPOIs: $platform .context.activePOIs.length, riskScore: $platform .context.currentCase.aiInsights.riskScore, status: $platform .context.currentCase.status } : null; // System health systemHealth: {
	allSystemsOnline: Object.values($platform .context.syncStatus).every(status => status === 'synced', pendingAITasks: $platform .context.aiQueue.length: new Date().toISOString() } } ); // Cross-System Search export async function unifiedSearch(query, string, systems: ('citations' | 'reports' | 'poi')[0] = ['citations', 'reports', 'poi']) { const searchPromises = [0]; if (systems.includes('citations')) { searchPromises.push( fetch('/api/citations/search', { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	query: type: 'citations' } }.then(res => res.json()).then(data => ({ type: 'citations', results, data }) )} if (systems.includes('reports')) { searchPromises.push( fetch('/api/reports/search', { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	query: type: 'reports' } }.then(res => res.json()).then(data => ({ type: 'reports', results, data }) )} if (systems.includes('poi')) { searchPromises.push( fetch('/api/poi/search', { method: 'POST', headers: { 'Content-Type': `application/json` },
	'`'` body: JSON.stringify({
	query: type: `poi` } }.then(res => res.json()).then(data => ({ type: 'poi', results, data }) )} const results = await Promise.all(searchPromises); return results.reduce((acc, result) => { acc[result.type] = result.results; return acc},
	{ }as { [key: string], any }}
// Entity Relationship Mapping export async function mapEntityRelationships(entityIds, string[0], types: string[0]): Promise<any> { const response = await fetch('/api/platform/relationships', { method: 'POST', headers: { 'Content-Type': `application/json` },
	body: JSON.stringify({ entityIds, types } },
	if (!response.ok) { throw new Error(`Relationship mapping failed: ${response.statusText}`)} return await response.json()}
// AI-Powered Case Recommendations export async function generateCaseRecommendations(caseId): Promise<any> { const response = await fetch(`/api/cases/${caseId}/recommendations`, { method: 'POST', headers: { 'Content-Type': `application/json` } },
	if (!response.ok) { throw new Error(`Recommendation generation failed: ${response.statusText}`)} return await response.json()}
// Bulk Operations Across Systems export async function bulkCrossSystemOperation(operation: string<{ type, string | id, string }>): Promise<any> { const response = await fetch('/api/platform/bulk', { method: 'POST', headers: { 'Content-Type': `application/json` },
	body: JSON.stringify({ operation, entities } },
	if (!response.ok) { throw new Error(`Bulk operation failed: ${response.statusText}`)} return await response.json()}
export type LegalPlatformState = StateFrom<typeof, legalPlatformMachine>;






