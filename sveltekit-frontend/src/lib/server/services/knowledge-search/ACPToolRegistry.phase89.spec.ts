import { describe, expect, it } from 'vitest';
import { getACPToolRegistry, toolSupportsDryRun } from './ACPToolRegistry.js';

describe('ACP tool registry phase89 workflow', () => {
	it('registers the board workflow tool for ACP discovery', () => {
		const registry = getACPToolRegistry();
		const tool = registry.get('phase89:board-workflow');

		expect(tool?.name).toBe('phase89:board-workflow');
		expect(tool?.category).toBe('error-analysis');
		expect(toolSupportsDryRun('phase89:board-workflow')).toBe(true);
	});
});
