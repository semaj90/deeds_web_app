import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function discoverSourceFiles(root: string, extensions: string[] = ['.ts', '.tsx', '.svelte', '.md']): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) continue;
    if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

