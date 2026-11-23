/**
 * GAN validation helpers for Atlas KAG/RAG/DAG/ACE MCP calls.
 *
 * These helpers report proof state; they do not admit evidence, authorize tools,
 * persist receipts, or promote a feature. Callers must supply independently
 * observed proof references before a claim can reach PROVEN or DONE.
 */

export type GanValidationStatusV1 = 'NOT_CREATED' | 'CREATED' | 'WIRED' | 'PROVEN' | 'DONE';
export type GanProofGateV1 = 'PASS' | 'FAIL' | 'NOT_RUN';

export interface GanValidationProofInputV1 {
	created: boolean;
	wired: boolean;
	sourceRevision?: string | null;
	workspaceRevision?: string | null;
	exactCommand?: string | null;
	outputDigest?: string | null;
	reportPath?: string | null;
	adversarialProbe?: GanProofGateV1;
	adversarialProbeRef?: string | null;
	replay?: GanProofGateV1;
	replayRef?: string | null;
	cacheIdentity?: GanProofGateV1;
	cacheIdentityRef?: string | null;
	provenance?: GanProofGateV1;
	provenanceRef?: string | null;
	acceptedByReviewer?: string | null;
}

export interface GanMcpHookObservationInputV1 {
	toolName: string;
	workspaceRevision?: string | null;
	packetKey?: string | null;
	packetRevision?: string | null;
	resultOk: boolean;
	canonicalEvidenceValidity?: string | null;
	canonicalAuthority?: boolean;
	writesPerformed?: boolean;
}

export type GanMcpHookLaneV1 = 'DISCOVERY' | 'KAG_RAG' | 'DAG_POLICY' | 'ACE_CONTEXT' | 'ACTION_SURFACE';

export interface GanMcpHookObservationV1 {
	schema: 'atlas.gan-mcp-hook-observation.v1';
	status: 'WIRED';
	lane: GanMcpHookLaneV1;
	toolName: string;
	resultOk: boolean;
	identity: {
		workspaceRevision: string | null;
		packetKey: string | null;
		packetRevision: string | null;
		sourceRevision: null;
		callerIdentityStatus: 'UNVERIFIED_CALLER_INPUT';
	};
	gateStatus: {
		sourceAdmission: 'NOT_ADMITTED';
		contextManifest: 'NOT_AVAILABLE';
		replay: 'NOT_RUN';
		cacheIdentity: 'NOT_RUN';
		provenance: 'NOT_BOUND';
		adversarialProbe: 'NOT_RUN';
		writes: 'NONE_OBSERVED' | 'WRITE_OBSERVED' | 'NOT_REPORTED';
	};
	proofUsable: false;
	canonicalEvidenceValidity: string;
	canonicalAuthority: false;
	writesPerformed: boolean;
}

const nonEmpty = (value: string | null | undefined): value is string =>
	typeof value === 'string' && value.trim().length > 0;
const sha256 = (value: string | null | undefined): value is string =>
	typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);

/**
 * Keep the GAN status vocabulary evidence-driven. A status string or passing
 * unit test alone cannot promote a pipeline; PROVEN requires all four gates,
 * exact command/output, a report, and source/workspace revisions. DONE also
 * requires explicit reviewer acceptance.
 */
export function classifyGanValidationStatusV1(input: GanValidationProofInputV1): GanValidationStatusV1 {
	if (!input.created) return 'NOT_CREATED';
	if (!input.wired) return 'CREATED';
	const gatesPassed = input.adversarialProbe === 'PASS'
		&& nonEmpty(input.adversarialProbeRef)
		&& input.replay === 'PASS'
		&& nonEmpty(input.replayRef)
		&& input.cacheIdentity === 'PASS'
		&& nonEmpty(input.cacheIdentityRef)
		&& input.provenance === 'PASS'
		&& nonEmpty(input.provenanceRef);
	const evidenceComplete = sha256(input.sourceRevision)
		&& sha256(input.workspaceRevision)
		&& nonEmpty(input.exactCommand)
		&& sha256(input.outputDigest)
		&& nonEmpty(input.reportPath);
	if (!gatesPassed || !evidenceComplete) return 'WIRED';
	if (nonEmpty(input.acceptedByReviewer)) return 'DONE';
	return 'PROVEN';
}

/**
 * Attach a conservative, non-persistent observation to an Atlas semantic MCP
 * result. Runtime revisions are caller supplied; source admission and ACE
 * manifest admission are intentionally never inferred here.
 */
export function buildGanMcpHookObservationV1(input: GanMcpHookObservationInputV1): GanMcpHookObservationV1 {
	const lane: GanMcpHookLaneV1 = input.toolName === 'atlas.discover'
		? 'DISCOVERY'
		: input.toolName === 'atlas.retrieve'
			? 'KAG_RAG'
			: input.toolName === 'atlas.build_context'
				? 'ACE_CONTEXT'
				: input.toolName === 'atlas.inspect_runtime' || input.toolName === 'atlas.validate_change'
					? 'DAG_POLICY'
					: 'ACTION_SURFACE';
	const writes = input.writesPerformed === true
		? 'WRITE_OBSERVED'
		: input.writesPerformed === false
			? 'NONE_OBSERVED'
			: 'NOT_REPORTED';
	return {
		schema: 'atlas.gan-mcp-hook-observation.v1',
		status: 'WIRED',
		lane,
		toolName: input.toolName,
		resultOk: input.resultOk,
		identity: {
			workspaceRevision: input.workspaceRevision ?? null,
			packetKey: input.packetKey ?? null,
			packetRevision: input.packetRevision ?? null,
			sourceRevision: null,
			callerIdentityStatus: 'UNVERIFIED_CALLER_INPUT',
		},
		gateStatus: {
			sourceAdmission: 'NOT_ADMITTED',
			contextManifest: 'NOT_AVAILABLE',
			replay: 'NOT_RUN',
			cacheIdentity: 'NOT_RUN',
			provenance: 'NOT_BOUND',
			adversarialProbe: 'NOT_RUN',
			writes,
		},
		proofUsable: false,
		canonicalEvidenceValidity: input.canonicalEvidenceValidity ?? 'NOT_ADMITTED',
		canonicalAuthority: false,
		writesPerformed: input.writesPerformed === true,
	};
}
