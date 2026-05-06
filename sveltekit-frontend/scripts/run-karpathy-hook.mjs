import fs from 'fs';
import path from 'path';

const API_URL = process.env.API_URL || 'http://localhost:5173/api/codebase-index/karpathy-hook';

async function runKarpathyHook(dir) {
	console.log(`[karpathy-hook] Scanning directory: ${dir}`);
	
	// Basic directory scan to simulate input
	const files = [];
	function scan(currentDir) {
		const items = fs.readdirSync(currentDir);
		for (const item of items) {
			const fullPath = path.join(currentDir, item);
			const stat = fs.statSync(fullPath);
			if (stat.isDirectory()) {
				if (item !== 'node_modules' && !item.startsWith('.')) {
					scan(fullPath);
				}
			} else if (item.endsWith('.ts') || item.endsWith('.js') || item.endsWith('.svelte')) {
				files.push({
					filePath: path.relative(process.cwd(), fullPath).replace(/\\/g, '/'),
					content: fs.readFileSync(fullPath, 'utf8'),
					contentHash: 'placeholder-hash', // In real use, we'd hash it
					audit: {}
				});
			}
		}
	}

	scan(dir);
	console.log(`[karpathy-hook] Found ${files.length} files. Sending to hook...`);

	const response = await fetch(API_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			repoRoot: process.cwd(),
			runId: `manual-${Date.now()}`,
			source: 'rg',
			files: files.slice(0, 10) // Limit for demo
		})
	});

	const result = await response.json();
	console.log('[karpathy-hook] Result:', JSON.stringify(result, null, 2));
}

const targetDir = process.argv[2] || 'src/lib/server/ai';
runKarpathyHook(targetDir).catch(console.error);
