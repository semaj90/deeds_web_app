// scripts/codemods/fix-imports.js
import { workerData, parentPort } from 'node:worker_threads';
import { readFile, writeFile } from 'node:fs/promises';

const { file } = workerData;

(async () => {
  let text = await readFile(file, 'utf8');
  const original = text;

  // 1️⃣ lucide-svelte: switch named imports → default
  text = text.replace(
    /import\s+{\s*([A-Z][A-Za-z0-9_]*)\s*}\s+from\s+['"]lucide-svelte['"]/g,
    "import $1 from 'lucide-svelte'"
  );

  // 2️⃣ UI components: if importing from a .svelte path, use default
  text = text.replace(
    /import\s+{\s*([A-Z][A-Za-z0-9_]*)\s*}\s+from\s+['"](.*\.svelte)['"]/g,
    "import $1 from '$2'"
  );

  // 3️⃣ Add missing .svelte extensions where omitted
  text = text.replace(
    /from\s+['"](\$lib\/components\/[A-Za-z0-9_\-/]+)(?=['"])/g,
    "from '$1.svelte'"
  );

  // 4️⃣ Replace deprecated HeadlessUI props
  text = text.replace(/children:/g, '');

  // 5️⃣ Remove duplicate imports introduced by merges
  text = text.replace(/^(import .*;)\n(?=.*^\1$)/gm, '');

  if (text !== original) {
    await writeFile(file, text);
    parentPort.postMessage(`✔ [imports] ${file}\n`);
  } else {
    parentPort.postMessage(`· [imports] ${file}\n`);
  }
})();
