import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkgPath = path.join(__dirname, '..', 'sveltekit-frontend', 'package.json');

async function main() {
  try {
	const raw = await fs.promises.readFile(pkgPath, 'utf8');
	const pkg = JSON.parse(raw);
	const all = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

	// Accept common package name variants
	const candidates = ['pgvector', 'pg-vector', '@pgvector/core'];
	for (const name of candidates) {
	  if (Object.prototype.hasOwnProperty.call(all, name)) {
		console.log(`pgvector dependency found: ${name} -> ${all[name]}`);
		return;
	  }
	}

	console.log('pgvector dependency not found');
	process.exitCode = 1;
  } catch (err) {
	console.error('Error checking package.json:', err && err.message ? err.message : String(err));
	process.exitCode = 2;
  }
}

main();
