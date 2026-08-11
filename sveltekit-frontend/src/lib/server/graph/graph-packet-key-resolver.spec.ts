import { describe, expect, it } from 'vitest';
import { classifyGraphPacketPath } from './graph-packet-key-resolver.js';

describe('graph-packet-key-resolver', () => {
	it('classifies policy docs and worktree shadows as excluded', () => {
		expect(classifyGraphPacketPath('src/lib/components/AGENTS.md.bak')).toEqual({
			kind: 'excluded',
			normalizedPath: 'lib/components/AGENTS.md.bak',
			reason: 'shadow-backup',
		});
		expect(classifyGraphPacketPath('src/lib/server/gpu/LLMS.md')).toEqual({
			kind: 'excluded',
			normalizedPath: 'lib/server/gpu/LLMS.md',
			reason: 'policy-document',
		});
		expect(classifyGraphPacketPath('.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/routes/dev/file-card/[...sourceRef]/+page.server.ts')).toEqual({
			kind: 'excluded',
			normalizedPath: 'routes/dev/file-card/[...sourceRef]/+page.server.ts',
			reason: 'worktree-shadow',
		});
	});

	it('classifies ordinary source paths as canonical candidates', () => {
		expect(classifyGraphPacketPath('sveltekit-frontend/src/lib/server/graph/graph-analysis-runner.ts')).toEqual({
			kind: 'canonical',
			normalizedPath: 'lib/server/graph/graph-analysis-runner.ts',
		});
	});
});
