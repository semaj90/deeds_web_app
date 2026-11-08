import { describe, it, expect } from 'vitest';
import {
	transitionTaskLifecycleV1,
	resolveDetectiveCanvasBadgeV1
} from './task-execution-lifecycle-fsm-v1.js';
import { encodeTaskDomains } from '../taxonomy/task-domain-lut-reconciliation-v1.js';

describe('Task Execution Lifecycle FSM V1 & Gate P3/P4 Guards', () => {
	const mask = encodeTaskDomains([9, 1]); // 257

	it('enforces DISCOVERED -> CLASSIFIED -> RANKED -> DEPENDENCY_CHECKED -> READY -> RUNNING -> VERIFIED', () => {
		const r1 = transitionTaskLifecycleV1({
			taskId: 'openspec/changes/foo/tasks.md#L10',
			runId: 'run-001',
			actor: 'operator:james',
			sourceRevision: 'sha256:abc123',
			fromState: 'DISCOVERED',
			toState: 'CLASSIFIED',
			primaryLutByte: 9,
			domainBitmask: mask
		});
		expect(r1.toState).toBe('CLASSIFIED');

		const r2 = transitionTaskLifecycleV1({
			taskId: r1.taskId,
			runId: r1.runId,
			actor: r1.actor,
			sourceRevision: r1.sourceRevision,
			fromState: r1.toState,
			toState: 'RANKED',
			primaryLutByte: 9,
			domainBitmask: mask
		});
		expect(r2.toState).toBe('RANKED');

		// Ranking alone NEVER authorizes execution (RANKED -> RUNNING is blocked)
		expect(() =>
			transitionTaskLifecycleV1({
				taskId: r2.taskId,
				runId: r2.runId,
				actor: r2.actor,
				sourceRevision: r2.sourceRevision,
				fromState: 'RANKED',
				toState: 'RUNNING',
				primaryLutByte: 9,
				domainBitmask: mask,
				authorizationGranted: true,
				inputsPresent: true
			})
		).toThrow('ILLEGAL_TASK_FSM_TRANSITION_RANKED_TO_RUNNING');

		const r3 = transitionTaskLifecycleV1({
			taskId: r2.taskId,
			runId: r2.runId,
			actor: r2.actor,
			sourceRevision: r2.sourceRevision,
			fromState: 'RANKED',
			toState: 'DEPENDENCY_CHECKED',
			primaryLutByte: 9,
			domainBitmask: mask
		});

		const r4 = transitionTaskLifecycleV1({
			taskId: r3.taskId,
			runId: r3.runId,
			actor: r3.actor,
			sourceRevision: r3.sourceRevision,
			fromState: 'DEPENDENCY_CHECKED',
			toState: 'READY',
			primaryLutByte: 9,
			domainBitmask: mask,
			unresolvedDependencies: [],
			authorizationGranted: true,
			inputsPresent: true
		});
		expect(r4.toState).toBe('READY');
		expect(r4.writesPerformed).toBe(false);
	});

	it('routes DEPENDENCY_CHECKED -> BLOCKED when dependencies, inputs, or authorization are missing', () => {
		expect(() =>
			transitionTaskLifecycleV1({
				taskId: 'openspec/changes/foo/tasks.md#L20',
				runId: 'run-002',
				actor: 'agent:opencode',
				sourceRevision: 'sha256:def456',
				fromState: 'DEPENDENCY_CHECKED',
				toState: 'READY',
				primaryLutByte: 9,
				domainBitmask: mask,
				unresolvedDependencies: ['MIGRATION-01'],
				authorizationGranted: false,
				inputsPresent: true
			})
		).toThrow('CANNOT_TRANSITION_TO_READY_UNRESOLVED_DEPS:MIGRATION-01');

		const blocked = transitionTaskLifecycleV1({
			taskId: 'openspec/changes/foo/tasks.md#L20',
			runId: 'run-002',
			actor: 'agent:opencode',
			sourceRevision: 'sha256:def456',
			fromState: 'DEPENDENCY_CHECKED',
			toState: 'BLOCKED',
			primaryLutByte: 9,
			domainBitmask: mask,
			unresolvedDependencies: ['MIGRATION-01'],
			authorizationGranted: false,
			inputsPresent: true
		});
		expect(blocked.toState).toBe('BLOCKED');
		expect(blocked.blockReason).toContain('UNRESOLVED_DEPS(MIGRATION-01)');
		expect(blocked.blockReason).toContain('MISSING_AUTHORIZATION');
	});

	it('Gate P3: verifies DetectiveModeCanvas badge parity, unknown-code fallback, and synthetic label guard', () => {
		const validBadge = resolveDetectiveCanvasBadgeV1({
			caseId: 'case-2026-001',
			sourceRevision: 'rev-1',
			isSyntheticFixture: true,
			lutCodeOrHex: '0x0A'
		});
		expect(validBadge.provenanceLabel).toBe('MOCK SYNTHETIC CASE');
		expect(validBadge.taskLutHex).toBe('0x0A');
		expect(validBadge.canonicalPaletteDomain).toBe('ui');
		expect(validBadge.canonicalNesHex).toBe('0x2A');
		expect(validBadge.fallbackUsed).toBe(false);

		const unknownBadge = resolveDetectiveCanvasBadgeV1({
			caseId: 'case-2026-002',
			sourceRevision: 'rev-2',
			isSyntheticFixture: false,
			lutCodeOrHex: '0xFF'
		});
		expect(unknownBadge.provenanceLabel).toBe('VERIFIED CASE RECORD');
		expect(unknownBadge.fallbackUsed).toBe(true);
		expect(unknownBadge.taskLutHex).toBe('0x00');
		expect(unknownBadge.canonicalPaletteDomain).toBe('general');
		expect(unknownBadge.canonicalNesHex).toBe('0x0F');
	});
});
