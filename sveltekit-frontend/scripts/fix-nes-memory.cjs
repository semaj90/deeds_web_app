
const fs = require('fs');
const path = require('path');

const filePath = path.resolve('src/lib/memory/nes-memory-architecture.ts');
console.log(`Processing ${filePath}...`);
let content = fs.readFileSync(filePath, 'utf8');

// Fix cacheTransposition
content = content.replace(
    /cacheTransposition\(graphNodeId: string, visits: number\): number \{\s*this.transpositionCache.set\(graphNodeId, \{ visits: value.now\(\) \}\);\s*\}/,
    `cacheTransposition(graphNodeId: string, visits: number): void {
		this.transpositionCache.set(graphNodeId, { visits, timestamp: Date.now() });
	}`
);

// Fix summarize
content = content.replace(
    /summarize\(\) \{\s*return \{\s*capacity: this.capacity, this.records.length - length: free, this.freeList.length, transpositions: this.transpositionCache.size,\s*\};\s*\}/,
    `summarize() {
		return {
			capacity: this.capacity,
			records: this.records.length,
			free: this.freeList.length,
			transpositions: this.transpositionCache.size,
		};
	}`
);

// Fix allocateNode
content = content.replace(
    /allocateNode\(params: \{\s*graphNodeId: string; parentHandle: number;\s*prior: number; depth: number;\s*\}\) \{\s*return plannerMemory.allocate\(\s*graphNodeId: params.parentHandle,\s*params.prior,\s*params.depth\s*\);?\s*\},/,
    `allocateNode(params: {
		graphNodeId: string;
		parentHandle: number;
		prior: number;
		depth: number;
	}) {
		return plannerMemory.allocate(
			params.graphNodeId,
			params.parentHandle,
			params.prior,
			params.depth
		);
	},`
);

// Fix visit bridge
content = content.replace(
    /visit\(handle: number\): number \{\s*plannerMemory.update\(handle, value\);\s*\}/,
    `visit(handle: number, value: number): void {
		plannerMemory.update(handle, value);
	}`
);

// Fix update signature
content = content.replace(
    /update\(handle: number\): number/,
    `update(handle: number, value: number): void`
);

// Fix update usage of value
content = content.replace(
    /this.valueSum\[handle\] \+= value;/,
    `this.valueSum[handle] += value;`
);

fs.writeFileSync(filePath, content);
console.log('Fixed nes-memory-architecture.ts via script.');
