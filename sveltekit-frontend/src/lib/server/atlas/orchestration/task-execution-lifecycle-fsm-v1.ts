import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
	decodeTaskDomains,
	translateTaskLutToCanonicalPalette,
	VALID_TASK_DOMAIN_MASK,
	type TaskDomainTranslationEntryV2
} from '../taxonomy/task-domain-lut-reconciliation-v1.js';

export const TASK_EXECUTION_LIFECYCLE_FSM_SCHEMA_V1 = 'atlas.task-execution-lifecycle-fsm.v1' as const;

export const TaskLifecycleStateSchemaV1 = z.enum([
	'DISCOVERED',
	'CLASSIFIED',
	'RANKED',
	'DEPENDENCY_CHECKED',
	'BLOCKED',
	'READY',
	'RUNNING',
	'VERIFIED',
	'FAILED'
]);
export type TaskLifecycleStateV1 = z.infer<typeof TaskLifecycleStateSchemaV1>;

const ALLOWED_TASK_TRANSITIONS: Readonly<
	Record<TaskLifecycleStateV1, readonly TaskLifecycleStateV1[]>
> = Object.freeze({
	DISCOVERED: ['CLASSIFIED'],
	CLASSIFIED: ['RANKED'],
	RANKED: ['DEPENDENCY_CHECKED'],
	DEPENDENCY_CHECKED: ['BLOCKED', 'READY'],
	BLOCKED: ['DEPENDENCY_CHECKED'],
	READY: ['RUNNING', 'BLOCKED'],
	RUNNING: ['VERIFIED', 'FAILED'],
	VERIFIED: [],
	FAILED: ['DEPENDENCY_CHECKED']
});

export const TaskTransitionReceiptSchemaV1 = z.object({
	schema: z.literal(TASK_EXECUTION_LIFECYCLE_FSM_SCHEMA_V1),
	taskId: z.string().min(1),
	runId: z.string().min(1),
	actor: z.string().min(1),
	sourceRevision: z.string().min(1),
	fromState: TaskLifecycleStateSchemaV1,
	toState: TaskLifecycleStateSchemaV1,
	primaryLutByte: z.number().int().min(1).max(10),
	domainBitmask: z.number().int().min(1).max(VALID_TASK_DOMAIN_MASK),
	unresolvedDependencies: z.array(z.string()),
	authorizationGranted: z.boolean(),
	inputsPresent: z.boolean(),
	blockReason: z.string().nullable(),
	receiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
	canonicalAuthority: z.literal(false),
	writesPerformed: z.literal(false)
});
export type TaskTransitionReceiptV1 = z.infer<typeof TaskTransitionReceiptSchemaV1>;

export interface TaskLifecycleTransitionInputV1 {
	taskId: string;
	runId: string;
	actor: string;
	sourceRevision: string;
	fromState: TaskLifecycleStateV1;
	toState: TaskLifecycleStateV1;
	primaryLutByte: number;
	domainBitmask: number;
	unresolvedDependencies?: string[];
	authorizationGranted?: boolean;
	inputsPresent?: boolean;
}

/**
 * Enforces the Parent Atlas Task Execution Lifecycle FSM:
 *   DISCOVERED -> CLASSIFIED -> RANKED -> DEPENDENCY_CHECKED -> BLOCKED | READY -> RUNNING -> VERIFIED | FAILED
 *
 * Hard invariant: Ranking alone NEVER authorizes execution (`RANKED -> RUNNING` is forbidden).
 * Transitioning `DEPENDENCY_CHECKED -> READY` requires `unresolvedDependencies.length === 0`,
 * `authorizationGranted === true`, and `inputsPresent === true`; otherwise the task must transition to `BLOCKED`.
 */
export function transitionTaskLifecycleV1(
	input: TaskLifecycleTransitionInputV1
): TaskTransitionReceiptV1 {
	const allowed = ALLOWED_TASK_TRANSITIONS[input.fromState];
	if (!allowed || !allowed.includes(input.toState)) {
		throw new Error(`ILLEGAL_TASK_FSM_TRANSITION_${input.fromState}_TO_${input.toState}`);
	}

	// Verify 10-bit domainBitmask round-trip and canonical NES palette translation
	const decodedCodes = decodeTaskDomains(input.domainBitmask);
	if (!decodedCodes.includes(input.primaryLutByte)) {
		throw new Error('PRIMARY_LUT_NOT_IN_DOMAIN_BITMASK');
	}
	translateTaskLutToCanonicalPalette(input.primaryLutByte);

	const unresolved = input.unresolvedDependencies ?? [];
	const authGranted = input.authorizationGranted ?? false;
	const inputsOk = input.inputsPresent ?? false;

	let blockReason: string | null = null;
	if (input.toState === 'READY') {
		if (unresolved.length > 0) {
			throw new Error(`CANNOT_TRANSITION_TO_READY_UNRESOLVED_DEPS:${unresolved.join(',')}`);
		}
		if (!authGranted) {
			throw new Error('CANNOT_TRANSITION_TO_READY_MISSING_AUTHORIZATION');
		}
		if (!inputsOk) {
			throw new Error('CANNOT_TRANSITION_TO_READY_MISSING_INPUTS');
		}
	} else if (input.toState === 'BLOCKED') {
		const reasons: string[] = [];
		if (unresolved.length > 0) reasons.push(`UNRESOLVED_DEPS(${unresolved.join(',')})`);
		if (!authGranted) reasons.push('MISSING_AUTHORIZATION');
		if (!inputsOk) reasons.push('MISSING_INPUTS');
		blockReason = reasons.join(' | ') || 'EXPLICIT_OPERATOR_HOLD';
	}

	const body = {
		schema: TASK_EXECUTION_LIFECYCLE_FSM_SCHEMA_V1,
		taskId: input.taskId,
		runId: input.runId,
		actor: input.actor,
		sourceRevision: input.sourceRevision,
		fromState: input.fromState,
		toState: input.toState,
		primaryLutByte: input.primaryLutByte,
		domainBitmask: input.domainBitmask,
		unresolvedDependencies: unresolved,
		authorizationGranted: authGranted,
		inputsPresent: inputsOk,
		blockReason,
		canonicalAuthority: false as const,
		writesPerformed: false as const
	};

	const receiptSha256 = createHash('sha256').update(JSON.stringify(body)).digest('hex');
	return TaskTransitionReceiptSchemaV1.parse({
		...body,
		receiptSha256
	});
}

/**
 * Gate P3 helper: Resolves DetectiveModeCanvas NES LUT badge metadata with safe fallback
 * for unknown codes, cross-case isolation key binding, and synthetic-evidence disclosure.
 */
export interface DetectiveCanvasBadgeViewV1 {
	caseId: string;
	sourceRevision: string;
	isSyntheticFixture: boolean;
	provenanceLabel: 'MOCK SYNTHETIC CASE' | 'VERIFIED CASE RECORD';
	taskLutHex: string;
	pillar: string;
	canonicalPaletteDomain: string;
	canonicalNesHex: string;
	fallbackUsed: boolean;
}

export function resolveDetectiveCanvasBadgeV1(input: {
	caseId: string;
	sourceRevision: string;
	isSyntheticFixture: boolean;
	lutCodeOrHex: number | string | null | undefined;
}): DetectiveCanvasBadgeViewV1 {
	if (!input.caseId.trim()) {
		throw new Error('DETECTIVE_CANVAS_CASE_ID_REQUIRED');
	}
	if (!input.sourceRevision.trim()) {
		throw new Error('DETECTIVE_CANVAS_SOURCE_REVISION_REQUIRED');
	}

	let parsedCode: number | null = null;
	if (typeof input.lutCodeOrHex === 'number' && Number.isInteger(input.lutCodeOrHex)) {
		parsedCode = input.lutCodeOrHex;
	} else if (typeof input.lutCodeOrHex === 'string' && /^0x0[1-9a]$/i.test(input.lutCodeOrHex.trim())) {
		parsedCode = Number.parseInt(input.lutCodeOrHex.trim(), 16);
	}

	let entry: TaskDomainTranslationEntryV2;
	let fallbackUsed = false;
	if (parsedCode !== null && parsedCode >= 1 && parsedCode <= 10) {
		entry = translateTaskLutToCanonicalPalette(parsedCode);
	} else {
		// Safe fallback for unknown/corrupt LUT codes -> general (nesHex 0x0F)
		fallbackUsed = true;
		entry = translateTaskLutToCanonicalPalette(8); // bridges to canonical `general` (nesHex 0x0F)
	}

	return {
		caseId: input.caseId,
		sourceRevision: input.sourceRevision,
		isSyntheticFixture: input.isSyntheticFixture,
		provenanceLabel: input.isSyntheticFixture ? 'MOCK SYNTHETIC CASE' : 'VERIFIED CASE RECORD',
		taskLutHex: fallbackUsed ? '0x00' : entry.taskLutHex,
		pillar: fallbackUsed ? 'UNRESOLVED' : entry.pillar,
		canonicalPaletteDomain: entry.canonicalPaletteDomain,
		canonicalNesHex: entry.canonicalPalette.nesHex,
		fallbackUsed
	};
}
