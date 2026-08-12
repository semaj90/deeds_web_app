#!/usr/bin/env node
/**
 * Parent Atlas PF4 pass-fabric proof reporter.
 *
 * Captures the live current-materialization boundary and the append-only
 * history snapshot into a durable JSON receipt.
 */

import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAnalysisPassBoundaryProofSnapshot } from '../../src/lib/server/analysis/analysis-pass-boundary.ts';
import { buildAnalysisPassCurrentProofSnapshot } from '../../src/lib/server/analysis/analysis-pass-current.ts';

function compactBoundary(snapshot: Awaited<ReturnType<typeof buildAnalysisPassBoundaryProofSnapshot>>) {
	return {
		status: snapshot.status,
		currentBoundaryKind: snapshot.currentBoundaryKind,
		appendOnlyHistoryTable: snapshot.appendOnlyHistoryTable,
		currentMaterializationView: snapshot.currentMaterializationView,
		rawRows: snapshot.rawRows,
		currentRows: snapshot.currentRows,
		canonicalRepresentationId: snapshot.canonicalRepresentationId,
		canonicalDimension: snapshot.canonicalDimension,
		reuseBoundary: snapshot.reuseBoundary,
		uniqueConstraintPresent: snapshot.uniqueConstraintPresent,
	};
}

function compactCurrent(snapshot: Awaited<ReturnType<typeof buildAnalysisPassCurrentProofSnapshot>>) {
	return {
		status: snapshot.status,
		rawRows: snapshot.rawRows,
		currentRows: snapshot.currentRows,
		duplicateCollapse: snapshot.duplicateCollapse,
		canonicalRepresentationId: snapshot.canonicalRepresentationId,
		canonicalDimension: snapshot.canonicalDimension,
		sampleCurrentRows: snapshot.sampleCurrentRows,
	};
}

async function main() {
	const generatedAt = new Date().toISOString();
	const boundary = await buildAnalysisPassBoundaryProofSnapshot();
	const current = await buildAnalysisPassCurrentProofSnapshot(10);
	const report = {
		receiptKind: 'PASS_FABRIC_CURRENT_MATERIALIZATION_PROVEN',
		status: boundary.status === 'available' && boundary.currentBoundaryKind === 'view_only' ? 'PROVEN' : 'PARTIAL',
		generatedAt,
		boundary: compactBoundary(boundary),
		current: compactCurrent(current),
	};

	const reportPath = resolve(process.cwd(), '../docs/reports/pass-fabric-proof.json');
	mkdirSync(resolve(reportPath, '..'), { recursive: true });
	writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.stack ?? error.message : String(error));
	process.exitCode = 1;
});
