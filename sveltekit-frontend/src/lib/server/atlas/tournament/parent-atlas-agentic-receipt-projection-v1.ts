import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { validateWorkflowActionEvent, type WorkflowActionEventV1 } from '../workflow/workflow-action-event-v1.js';
import type { ParentAtlasTournamentSnapshotV1, TournamentReceiptSourceV1 } from './parent-atlas-tournament-receipt-aggregator-v1.js';
import { calculateTournamentProgressV1, type TournamentGateV1 } from './parent-atlas-tournament-progress-v1.js';

export type ParentAtlasAgenticTelemetryV1 = {
	schema: 'atlas.parent-tournament-agentic-telemetry.v1';
	acceptedAgentTurns: number;
	uniqueAgentActions: number;
	tokensUsed: number | null;
	wallTimeMs: number | null;
	filesEdited: string[];
	openspecChanges: string[];
	receiptPaths: string[];
};

export type ParentAtlasTournamentSnapshotWithAgenticV1 = ParentAtlasTournamentSnapshotV1 & {
	agenticTelemetry: ParentAtlasAgenticTelemetryV1;
};

type AcceptedReceipt = {
	event: WorkflowActionEventV1;
	path: string;
};

function eventIdentity(event: WorkflowActionEventV1): string {
	return `${event.workflowId}:${event.actionId}:${event.sequence}`;
}

function elapsedMs(event: WorkflowActionEventV1): number | null {
	if (!event.startedAt || !event.finishedAt) return null;
	const start = Date.parse(event.startedAt);
	const finish = Date.parse(event.finishedAt);
	return Number.isFinite(start) && Number.isFinite(finish) && finish >= start ? finish - start : null;
}

async function readReceiptsJsonl(path: string): Promise<{ rows: unknown[]; diagnostics: string[] }> {
	try {
		const text = await readFile(path, 'utf8');
		const rows: unknown[] = [];
		const diagnostics: string[] = [];
		for (const [index, line] of text.split(/\r?\n/u).entries()) {
			if (!line.trim()) continue;
			try {
				rows.push(JSON.parse(line));
			} catch {
				diagnostics.push(`LINE_${index + 1}_INVALID_JSON`);
			}
		}
		return { rows, diagnostics };
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return { rows: [], diagnostics: [] };
		return { rows: [], diagnostics: [`READ_FAILED:${error instanceof Error ? error.message : String(error)}`] };
	}
}

async function collectAgenticReceipts(repoRoot: string): Promise<{ accepted: AcceptedReceipt[]; sources: TournamentReceiptSourceV1[] }> {
	const changesRoot = resolve(repoRoot, 'openspec', 'changes');
	let entries: Dirent[];
	try {
		entries = await readdir(changesRoot, { withFileTypes: true });
	} catch (error) {
		return {
			accepted: [],
			sources: [{
				path: 'openspec/changes',
				schema: 'atlas.workflow-action.v1',
				status: null,
				accepted: false,
				gateIds: [],
				diagnostics: [`READ_FAILED:${error instanceof Error ? error.message : String(error)}`]
			}]
		};
	}

	const accepted: AcceptedReceipt[] = [];
	const sources: TournamentReceiptSourceV1[] = [];
	const seen = new Set<string>();
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const relativePath = `openspec/changes/${entry.name}/receipts.jsonl`;
		const { rows, diagnostics } = await readReceiptsJsonl(resolve(changesRoot, entry.name, 'receipts.jsonl'));
		const sourceDiagnostics = [...diagnostics];
		let acceptedInFile = 0;
		for (const row of rows) {
			const event = row as WorkflowActionEventV1;
			const validation = validateWorkflowActionEvent(event);
			if (!validation.ok) {
				sourceDiagnostics.push(`INVALID_WORKFLOW_EVENT:${validation.errors.join('|')}`);
				continue;
			}
			if (event.kind !== 'completed' || event.state !== 'succeeded') {
				sourceDiagnostics.push(`NON_SUCCESS_EVENT:${eventIdentity(event)}`);
				continue;
			}
			if (event.lane !== 'acp' && event.lane !== 'a2a') {
				sourceDiagnostics.push(`NON_AGENTIC_LANE:${eventIdentity(event)}`);
				continue;
			}
			if (event.openspecChange !== entry.name) {
				sourceDiagnostics.push(`OPENSPEC_BINDING_MISMATCH:${eventIdentity(event)}`);
				continue;
			}
			const identity = eventIdentity(event);
			if (seen.has(identity)) {
				sourceDiagnostics.push(`DUPLICATE_EVENT_IDENTITY:${identity}`);
				continue;
			}
			seen.add(identity);
			accepted.push({ event, path: relativePath });
			acceptedInFile += 1;
		}
		if (rows.length > 0 || diagnostics.length > 0) {
			sources.push({
				path: relativePath,
				schema: 'atlas.workflow-action.v1',
				status: acceptedInFile > 0 ? 'AGENTIC_RECEIPTS_ACCEPTED' : 'NO_ACCEPTED_AGENTIC_RECEIPTS',
				accepted: acceptedInFile > 0,
				gateIds: acceptedInFile > 0 ? ['multi_agent_receipt'] : [],
				diagnostics: sourceDiagnostics
			});
		}
	}
	return { accepted, sources };
}

export async function applyParentAtlasAgenticReceiptProjectionV1(
	repoRoot: string,
	snapshot: ParentAtlasTournamentSnapshotV1
): Promise<ParentAtlasTournamentSnapshotWithAgenticV1> {
	const { accepted, sources } = await collectAgenticReceipts(repoRoot);
	const uniqueActions = new Set(accepted.map(({ event }) => `${event.workflowId}:${event.actionId}`));
	const filesEdited = [...new Set(accepted.flatMap(({ event }) => event.filesEdited ?? []))].sort();
	const openspecChanges = [...new Set(accepted.map(({ event }) => event.openspecChange).filter((value): value is string => Boolean(value)))].sort();
	const receiptPaths = [...new Set(accepted.map(({ path }) => path))].sort();
	const measuredTokenEvents = accepted.filter(({ event }) => event.tokensUsed !== undefined);
	const measuredDurations = accepted.map(({ event }) => elapsedMs(event)).filter((value): value is number => value !== null);
	const tokensUsed = measuredTokenEvents.length > 0
		? measuredTokenEvents.reduce((sum, { event }) => sum + (event.tokensUsed ?? 0), 0)
		: null;
	const wallTimeMs = measuredDurations.length > 0 ? measuredDurations.reduce((sum, value) => sum + value, 0) : null;

	const gates: TournamentGateV1[] = snapshot.gates.map((gate) => {
		if (gate.id !== 'multi_agent_receipt' || accepted.length === 0) return gate;
		const proven = uniqueActions.size >= 2;
		return {
			...gate,
			state: proven ? 'PROVEN' : 'PARTIAL',
			completion: proven ? undefined : 0.5,
			receiptRef: receiptPaths[0],
			filesEdited,
		};
	});

	// Recompute proof from the newly projected gate, but preserve any percentage
	// efficiency telemetry already calculated from explicit baseline receipts.
	// Raw agent token/time counters are exposed separately below; no savings are inferred.
	const proofOnly = calculateTournamentProgressV1(gates);
	const progress = { ...proofOnly, efficiency: snapshot.progress.efficiency };

	return {
		...snapshot,
		progress,
		gates,
		sources: [...snapshot.sources, ...sources],
		diagnostics: [
			...snapshot.diagnostics,
			...sources.flatMap((item) => item.diagnostics.map((diagnostic) => `${item.path}:${diagnostic}`))
		],
		agenticTelemetry: {
			schema: 'atlas.parent-tournament-agentic-telemetry.v1',
			acceptedAgentTurns: accepted.length,
			uniqueAgentActions: uniqueActions.size,
			tokensUsed,
			wallTimeMs,
			filesEdited,
			openspecChanges,
			receiptPaths
		}
	};
}
