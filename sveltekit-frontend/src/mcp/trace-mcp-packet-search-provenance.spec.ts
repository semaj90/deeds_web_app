import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/mcp/trace-mcp-server.ts'), 'utf8');

describe('TRACE MCP packet-search provenance', () => {
	const packetSearch = source.slice(source.indexOf("'atlas.packet_search'"), source.indexOf("'atlas.procedural_sequence_search'"));

	it('returns source and workspace revisions with the exact stored byte-span metadata', () => {
		expect(packetSearch).toMatch(/byte_start, byte_end, sha256, source_revision, workspace_revision, metadata/);
		expect(packetSearch).toContain('BEGIN READ ONLY');
	});
});
