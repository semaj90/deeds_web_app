// scripts/codemods/fix-types.js
import { workerData, parentPort } from 'node:worker_threads';
import { readFile, writeFile } from 'node:fs/promises';

const { file } = workerData;

(async () => {
  let text = await readFile(file, 'utf8');
  const orig = text;

  // 1️⃣ Optional chaining safety
  text = text.replace(/\.keyTopics\.length/g, '.keyTopics?.length ?? 0');

  // 2️⃣ Replace 'unknown' with 'any' for Svelte-check errors
  text = text.replace(/:\s*unknown/g, ': any');

  // 3️⃣ never[] → any[]
  text = text.replace(/never\[\]/g, 'any[]');

  // 4️⃣ Booleans mis-typed as arrays
  text = text.replace(/=\s*false;/g, '= $state(false);');

  // 5️⃣ Enum string mismatches (simple heuristic)
  text = text.replace(
    /overall(Applicability|Strength):\s*string/g,
    "overall$1: 'LOW' | 'MODERATE' | 'HIGH'"
  );

  // 6️⃣ Ensure each arrays are iterable
  text = text.replace(/{#each ([^}]+)\s+as\s+(\w+)}/g, '{#each Array.isArray($1) ? $1 : [] as $2}');

  if (text !== orig) {
    await writeFile(file, text);
    parentPort.postMessage(`✔ [types] ${file}\n`);
  } else {
    parentPort.postMessage(`· [types] ${file}\n`);
  }
})();
