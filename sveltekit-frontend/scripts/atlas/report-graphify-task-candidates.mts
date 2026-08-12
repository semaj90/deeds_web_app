#!/usr/bin/env node
/**
 * Daily Graphify TaskCandidate proof reporter.
 *
 * Builds typed TaskCandidate JSONL from the current daily graphify board
 * without mutating Kanban task state.
 */

import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDailyGraphifyBoard } from '../../src/lib/server/atlas/board/daily-graphify-board.ts';
import { buildDailyGraphifyTaskCandidates } from '../../src/lib/server/atlas/board/graphify-task-candidates.ts';
import { GraphifyTaskCandidateSchema } from '../../src/lib/server/atlas/contracts/graphify-task-candidate.ts';

function sha256(data: unknown): string {
	return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function writeJsonl(filePath: string, rows: unknown[]): void {
	mkdirSync(resolve(filePath, '..'), { recursive: true });
	const body = rows.map((row) => JSON.stringify(row)).join('\n');
	writeFileSync(filePath, `${body}${rows.length > 0 ? '\n' : ''}`, 'utf8');
}

async function main(): Promise<void> {
	const startedAt = new Date().toISOString();
	const board = await loadDailyGraphifyBoard();
	const candidates = buildDailyGraphifyTaskCandidates(board, {
		producerId: 'daily-graphify-board',
		producerRevision: board.generated,
		workspaceRevision: board.generated,
		sourceRevision: board.generated,
		graphRevision: board.generated,
		representationRevision: 'semantic_768',
		generatedAt: startedAt,
	});

	const parsedCandidates = candidates.map((candidate) => GraphifyTaskCandidateSchema.parse(candidate));
	const outputJsonl = resolve(process.cwd(), '../docs/reports/atlas-graphify-task-candidates.jsonl');
	const reportPath = resolve(process.cwd(), '../docs/reports/graphify-task-candidates-receipt.json');

	writeJsonl(outputJsonl, parsedCandidates);

	const taskCount = board.columns.reduce((count, column) => count + column.tasks.length, 0);
	const candidateKinds = parsedCandidates.reduce(
		(acc, candidate) => {
			acc[candidate.kind] = (acc[candidate.kind] ?? 0) + 1;
			return acc;
		},
		{ graphify_evidence: 0, recommendation_review: 0 } as Record<'graphify_evidence' | 'recommendation_review', number>,
	);
	const dedupKeyCount = new Set(parsedCandidates.map((candidate) => candidate.dedup_key)).size;
	const sourceRefCoverage = parsedCandidates.filter((candidate) => Boolean(candidate.source_ref)).length;
	const taskIds = new Set(parsedCandidates.map((candidate) => candidate.task_id));

	const receipt = {
		receiptKind: 'DAILY_GRAPHIFY_TASK_CANDIDATES_PROVEN',
		status: 'PROVEN',
		startedAt,
		completedAt: new Date().toISOString(),
		boardSource: board.boardSource,
		recommendationSource: board.recommendationSource,
		workflowState: board.workflowState,
		totalTasks: taskCount,
		candidateCount: parsedCandidates.length,
		uniqueTaskCount: taskIds.size,
		uniqueDedupKeyCount: dedupKeyCount,
		sourceRefCoverage,
		candidateKinds,
		importerStateSeparate: true,
		jsonlPath: outputJsonl,
		reportPath,
		inputHash: sha256({
			boardGenerated: board.generated,
			taskCount,
			candidateCount: parsedCandidates.length,
			boardSource: board.boardSource,
			recommendationSource: board.recommendationSource,
		}),
		outputHash: sha256({
			candidateKinds,
			dedupKeyCount,
			sourceRefCoverage,
			taskIds: Array.from(taskIds).sort(),
		}),
	};

	mkdirSync(resolve(reportPath, '..'), { recursive: true });
	writeFileSync(reportPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

	process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.stack ?? error.message : String(error));
	process.exitCode = 1;
});
