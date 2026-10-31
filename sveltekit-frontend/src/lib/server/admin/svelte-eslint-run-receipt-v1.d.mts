export type SvelteEslintFindingV1 = {
	filePath: string;
	ruleId: string | null;
	severity: 'error' | 'warning';
	message: string;
	line: number | null;
	column: number | null;
};

export type SvelteEslintRunReceiptV1 = {
	schema: 'atlas.svelte-eslint-run-receipt.v1';
	runId: string;
	capturedAt: string;
	status: 'PASS' | 'FAIL' | 'ERROR';
	exitCode: number | null;
	workspaceGitHead: string | null;
	sourceFiles: Array<{ path: string; sha256: string }>;
	sourceManifestSha256: string;
	summary: {
		filesChecked: number;
		errorCount: number;
		warningCount: number;
		findingCount: number;
	};
	findings: SvelteEslintFindingV1[];
	findingsTruncated: number;
	receiptSha256: string;
};

export function loadLatestSvelteEslintRunReceiptV1(): Promise<SvelteEslintRunReceiptV1 | null>;
export function loadRecentSvelteEslintRunReceiptsV1(limit?: number): Promise<SvelteEslintRunReceiptV1[]>;
