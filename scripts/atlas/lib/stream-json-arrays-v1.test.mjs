import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createJsonArrayWriterV1, writeJsonObjectWithArrayFilesV1 } from './stream-json-arrays-v1.mjs';

test('writes JSON array items incrementally and assembles an object without loading arrays', async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-json-stream-'));
	try {
		const nodesPath = path.join(directory, 'nodes.json');
		const edgesPath = path.join(directory, 'edges.json');
		const outputPath = path.join(directory, 'graph.json');
		const nodes = await createJsonArrayWriterV1(nodesPath);
		await nodes.append({ id: 'packet-a', node_type: 'Packet' });
		await nodes.append({ id: 'feature-b', node_type: 'Feature' });
		await nodes.close();
		const edges = await createJsonArrayWriterV1(edgesPath);
		await edges.append({ source: 'packet-a', target: 'feature-b' });
		await edges.close();

		await writeJsonObjectWithArrayFilesV1({
			outputPath,
			properties: { source: 'neo4j', validation_status: 'pending' },
			arrays: [{ key: 'nodes', filePath: nodesPath }, { key: 'edges', filePath: edgesPath }],
		});
		assert.deepEqual(JSON.parse(await fs.readFile(outputPath, 'utf8')), {
			source: 'neo4j',
			validation_status: 'pending',
			nodes: [{ id: 'packet-a', node_type: 'Packet' }, { id: 'feature-b', node_type: 'Feature' }],
			edges: [{ source: 'packet-a', target: 'feature-b' }],
		});
		await assert.rejects(writeJsonObjectWithArrayFilesV1({
			outputPath,
			properties: { source: 'neo4j' },
			arrays: [{ key: 'nodes', filePath: nodesPath }],
		}), { code: 'EEXIST' });
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});
