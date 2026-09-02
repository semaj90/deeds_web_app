import { createHash } from 'node:crypto';
import { createRlmSearchAdapter, type RlmSearchCache } from './rlm-search-adapter.js';
import type { RlmBudget, RlmEnvironmentV1, RlmInspectionTools, RlmSearchRequest, RlmSearchResult, RlmTrace, RlmTraceStep } from './rlm-contract.js';
import { admitRlmResultToAceFeatureSnapshotV1, type RlmAceFeatureAdmissionResultV1, type RlmAceFeatureBundleProviderV1 } from './rlm-ace-feature-admission-v1.js';

interface Counters {
	depthReached: number; subcalls: number; searchCalls: number; graphCalls: number;
	processCalls: number; packetHydrations: number; sourceReads: number;
	cacheHits: number; cacheMisses: number; duplicateSubproblemsSuppressed: number;
}

export interface RlmRuntimeOptions {
	budget: RlmBudget; workspaceRevision: string; policyRevision: string; requestId: string;
	environment?: RlmEnvironmentV1;
	cache?: RlmSearchCache; tools: RlmInspectionTools;
	search?: (request: RlmSearchRequest) => Promise<RlmSearchResult>;
	aceFeatureBundleProvider?: RlmAceFeatureBundleProviderV1;
}

export interface RlmRuntimeReceipt extends RlmTrace {
	limits: RlmBudget; observed: Counters; selectedCanonicalIds: string[];
	termination: RlmTrace['status']; durationMs: number;
	environment?: RlmEnvironmentV1;
}

function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24); }
function normalizeSubproblem(value: string): string { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }

export function createRlmRuntime(options: RlmRuntimeOptions) {
	const startedAt = Date.now();
	const visited = new Set<string>();
	const steps: RlmTraceStep[] = [];
	const selectedCanonicalIds: string[] = [];
	const counters: Counters = {
		depthReached: 0, subcalls: 0, searchCalls: 0, graphCalls: 0, processCalls: 0,
		packetHydrations: 0, sourceReads: 0, cacheHits: 0, cacheMisses: 0,
		duplicateSubproblemsSuppressed: 0,
	};
	let status: RlmTrace['status'] = 'COMPLETED';

	function addStep(step: Omit<RlmTraceStep, 'sequence'>): void { steps.push({ sequence: steps.length, ...step }); }
	function budgetReason(kind: RlmTraceStep['kind']): string | null {
		if (Date.now() - startedAt >= options.budget.deadlineMs) return 'DEADLINE_EXCEEDED';
		const limits: Record<string, number> = {
			SEARCH: options.budget.maxSearchCalls, GRAPH: options.budget.maxGraphExpansions,
			PROCESS: options.budget.maxProcessLookups, PACKET: options.budget.maxPacketHydrations,
			SOURCE: options.budget.maxSourceReads, RECURSE: options.budget.maxSubcalls,
		};
		const observed: Record<string, number> = {
			SEARCH: counters.searchCalls, GRAPH: counters.graphCalls, PROCESS: counters.processCalls,
			PACKET: counters.packetHydrations, SOURCE: counters.sourceReads, RECURSE: counters.subcalls,
		};
		return kind in limits && observed[kind] >= limits[kind] ? `${kind}_LIMIT_EXCEEDED` : null;
	}
	function allow(kind: RlmTraceStep['kind']): boolean {
		const reason = budgetReason(kind);
		if (!reason) return true;
		status = 'BUDGET_EXHAUSTED'; addStep({ kind: 'BUDGET', reason, durationMs: 0 }); return false;
	}
	function loopKey(operationKind: string, subproblem: string, filterHash = ''): string {
		return hash({ workspaceRevision: options.workspaceRevision, policyRevision: options.policyRevision,
			operationKind, subproblem: normalizeSubproblem(subproblem), filterHash });
	}
	async function inspect(kind: 'PACKET' | 'SOURCE' | 'GRAPH' | 'PROCESS', operation: () => Promise<unknown>): Promise<unknown | null> {
		if (!allow(kind)) return null;
		if (kind === 'PACKET') counters.packetHydrations += 1;
		if (kind === 'SOURCE') counters.sourceReads += 1;
		if (kind === 'GRAPH') counters.graphCalls += 1;
		if (kind === 'PROCESS') counters.processCalls += 1;
		const started = Date.now();
		try { const value = await operation(); addStep({ kind, durationMs: Date.now() - started }); return value; }
		catch { status = 'DEGRADED'; addStep({ kind, reason: 'OWNER_LOOKUP_FAILED', durationMs: Date.now() - started }); return null; }
	}

	return {
		async search(request: Omit<RlmSearchRequest, 'requestId' | 'workspaceRevision' | 'policyRevision' | 'budget'>) {
			if (!allow('SEARCH')) return null;
			counters.searchCalls += 1; counters.subcalls += 1;
			const search = options.search ?? (async (input: RlmSearchRequest) => createRlmSearchAdapter({ cache: options.cache }).search(input));
			let result: RlmSearchResult;
			try {
				result = await search({ ...request, requestId: options.requestId, workspaceRevision: options.workspaceRevision,
					policyRevision: options.policyRevision, budget: options.budget, environment: options.environment });
			} catch {
				status = 'FAILED';
				addStep({ kind: 'SEARCH', reason: 'RLM_PROGRAM_FAILED', durationMs: 0 });
				return null;
			}
			counters.cacheHits += result.trace.steps.filter((step) => step.cacheStatus === 'HIT').length;
			counters.cacheMisses += result.trace.steps.filter((step) => step.cacheStatus === 'MISS').length;
			selectedCanonicalIds.push(...result.response.topPacketKeys);
			steps.push(...result.trace.steps.map((step) => ({ ...step, sequence: steps.length + step.sequence })));
			return result;
		},
		async recurse<T>(depth: number, operation: () => Promise<T>): Promise<T | null> {
			if (depth > options.budget.maxDepth) {
				status = 'BUDGET_EXHAUSTED';
				addStep({ kind: 'BUDGET', reason: 'DEPTH_LIMIT_EXCEEDED', durationMs: 0 });
				return null;
			}
			if (!allow('RECURSE')) return null;
			counters.subcalls += 1;
			counters.depthReached = Math.max(counters.depthReached, depth);
			return operation();
		},
		async admitAceFeatureSnapshot(request: RlmSearchRequest, result: RlmSearchResult): Promise<RlmAceFeatureAdmissionResultV1> {
			if (!options.aceFeatureBundleProvider) return { status: 'UNAVAILABLE', reason: 'SERVER_FEATURE_BUNDLE_UNAVAILABLE' };
			return admitRlmResultToAceFeatureSnapshotV1({
				provider: options.aceFeatureBundleProvider,
				request,
				result,
			});
		},
		inspectPacket: (packetKey: string) => inspect('PACKET', () => options.tools.packet(packetKey)),
		inspectSource: (sourceRef: string, span?: { start: number; end: number }) => inspect('SOURCE', () => options.tools.source(sourceRef, span)),
		inspectGraph: (canonicalId: string, depth: number) => inspect('GRAPH', () => options.tools.graph(canonicalId, depth)),
		inspectProcess: (processId: string, name?: string) => inspect('PROCESS', () => options.tools.process(processId, name)),
		visitSubproblem(operationKind: string, subproblem: string, filterHash = ''): boolean {
			const key = loopKey(operationKind, subproblem, filterHash);
			if (visited.has(key)) { counters.duplicateSubproblemsSuppressed += 1; addStep({ kind: 'LOOP', reason: 'DUPLICATE_SUBPROBLEM_SUPPRESSED', durationMs: 0 }); return false; }
			visited.add(key); return true;
		},
		receipt(): RlmRuntimeReceipt {
			const trace: RlmTrace = { requestId: options.requestId, workspaceRevision: options.workspaceRevision,
				policyRevision: options.policyRevision, depthReached: counters.depthReached, subcalls: counters.subcalls,
				steps: steps.map((step, index) => ({ ...step, sequence: index })), status,
				...(status === 'FAILED' ? { failureCode: 'RLM_PROGRAM_FAILED' as const } : {}) };
			return { ...trace, limits: options.budget, observed: { ...counters }, selectedCanonicalIds: [...new Set(selectedCanonicalIds)], termination: status, durationMs: Date.now() - startedAt, environment: options.environment };
		},
	};
}
