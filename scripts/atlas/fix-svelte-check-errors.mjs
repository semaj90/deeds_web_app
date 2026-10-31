import fs from 'fs';
import path from 'path';

// 1. search-runtime.ts
const srPath = 'sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts';
let sr = fs.readFileSync(srPath, 'utf8');
sr = sr.replace(
  'candidateOrdinal: candidate.candidateOrdinal,',
  'candidateOrdinal: (candidate as { candidateOrdinal?: number }).candidateOrdinal,'
);
sr = sr.replace(
  'candidateOrdinal: candidate.candidateOrdinal,',
  'candidateOrdinal: (candidate as { candidateOrdinal?: number }).candidateOrdinal,'
);
fs.writeFileSync(srPath, sr, 'utf8');
console.log('Fixed search-runtime.ts');

// 2. codebase-context.ts
const ccPath = 'sveltekit-frontend/src/lib/server/features/rag/codebase-context.ts';
let cc = fs.readFileSync(ccPath, 'utf8');
cc = cc.replace(
  'reason=${snapshot.reason}',
  'reason=${(snapshot as { reason?: string }).reason}'
);
fs.writeFileSync(ccPath, cc, 'utf8');
console.log('Fixed codebase-context.ts');

// 3. current-source-authority-v1.ts
const csaPath = 'sveltekit-frontend/src/lib/server/atlas/identity/current-source-authority-v1.ts';
let csa = fs.readFileSync(csaPath, 'utf8');
csa = csa.replace(
  'snapshot.sources.length === (input.preflight?.snapshotSourceCount ?? snapshot.sources.length)',
  'snapshot.sources.length === (input.preflight?.sourceCount ?? snapshot.sources.length)'
);
csa = csa.replace(
  'snapshot.membershipChecksum === (input.preflight?.snapshotMembershipChecksum ?? snapshot.membershipChecksum)',
  'snapshot.membershipChecksum === (input.preflight?.membershipChecksum ?? snapshot.membershipChecksum)'
);
fs.writeFileSync(csaPath, csa, 'utf8');
console.log('Fixed current-source-authority-v1.ts');

// 4. (app)/admin/ai-dashboard/+page.svelte
const adPath = 'sveltekit-frontend/src/routes/(app)/admin/ai-dashboard/+page.svelte';
let ad = fs.readFileSync(adPath, 'utf8');
ad = ad.replace("import { resolve } from '$app/paths';", "");
ad = ad.replaceAll("href={resolve('", "href='");
ad = ad.replaceAll("href={resolve(\"", "href=\"");
ad = ad.replaceAll("')}", "'");
ad = ad.replaceAll("\")}", "\"");
fs.writeFileSync(adPath, ad, 'utf8');
console.log('Fixed ai-dashboard/+page.svelte');

// 5. (app)/admin/atlas/+page.svelte
const atPath = 'sveltekit-frontend/src/routes/(app)/admin/atlas/+page.svelte';
let at = fs.readFileSync(atPath, 'utf8');
at = at.replace("import { resolve } from '$app/paths';", "");
at = at.replaceAll("href={resolve('", "href='");
at = at.replaceAll("href={resolve(\"", "href=\"");
at = at.replaceAll("')}", "'");
at = at.replaceAll("\")}", "\"");
at = at.replace("onclick={exportSvelteEslintReceipt}", "onclick={() => exportSvelteEslintReceipt()}");
fs.writeFileSync(atPath, at, 'utf8');
console.log('Fixed admin/atlas/+page.svelte');
