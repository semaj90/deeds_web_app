const cp = require('child_process');
const fs = require('fs');

const files = [
  'deeds_labs/frontend/sveltekit-frontend-archive/dirs/training-datasets/entity-patterns.jsonl',
  'deeds_labs/frontend/sveltekit-frontend-archive/dirs/training-datasets/evidence-patterns.jsonl',
  'deeds_labs/frontend/sveltekit-frontend-archive/dirs/training-datasets/forensic-patterns.jsonl',
  'deeds_labs/frontend/sveltekit-frontend-archive/dirs/training-datasets/legal-keywords.jsonl',
  'deeds_labs/frontend/sveltekit-frontend-archive/dirs/training-datasets/rag-context.jsonl',
  'deeds_labs/frontend/sveltekit-frontend-archive/dirs/training-datasets/schema-patterns.jsonl',
  'deeds_labs/frontend/sveltekit-frontend-archive/dirs/training-datasets/svelte5-patterns.jsonl'
];

for (const f of files) {
  if (!fs.existsSync(f)) {
    console.log('Missing:', f);
    continue;
  }
  console.log('\n--- Processing:', f);
  try {
    cp.execSync(`node scripts/simd/convert-jsonl-comments.cjs "${f}"`, { stdio: 'inherit' });
  } catch (e) {
    console.error('Convert failed for', f, e && e.message);
    continue;
  }
  try {
    cp.execSync(`node scripts/simd/check-jsonl-lines.cjs "${f}"`, { stdio: 'inherit' });
  } catch (e) {
    console.error('Validation failed for', f, e && e.message);
  }
}

console.log('\nBatch convert complete.');
