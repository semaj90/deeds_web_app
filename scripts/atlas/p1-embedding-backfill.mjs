#!/usr/bin/env node

const report = {
	schema: 'atlas.p1-embedding-backfill.v1',
	status: 'BLOCKED_UNQUALIFIED_SOURCE_REVISION',
	canonicalAuthority: false,
	writesPerformed: false,
	blockers: [
		'SOURCE_AND_WORKSPACE_REVISION_BINDINGS_REQUIRED',
		'LEGACY_RUNNER_TARGETS_UNRECONCILED_EMBEDDING_COLUMNS',
		'EMBEDDING_MODEL_REVISION_AND_PRODUCER_PIN_REQUIRED'
	]
};

console.error(JSON.stringify(report, null, 2));
process.exitCode = 2;
