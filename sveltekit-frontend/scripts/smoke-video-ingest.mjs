import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

function argValue(name) {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const appBase = process.env.PUBLIC_APP_URL ?? process.env.SVELTEKIT_URL ?? 'http://127.0.0.1:5173';
const endpoint = argValue('endpoint') ?? new URL('/api/evidence/video/ingest', appBase).href;
const caseId = argValue('case-id');
const filePath = argValue('file');
const sourceUrl = argValue('source-url');
const operatorApproved = process.argv.includes('--approved');

if (!caseId) {
  console.error('Missing --case-id');
  process.exit(1);
}

if (!filePath && !sourceUrl) {
  console.error('Provide --file or --source-url');
  process.exit(1);
}

const form = new FormData();
form.set('caseId', caseId);
if (sourceUrl) form.set('sourceUrl', sourceUrl);
if (operatorApproved) form.set('operatorApproved', 'true');

if (filePath) {
  const bytes = await readFile(filePath);
  form.set('file', new Blob([bytes]), basename(filePath));
}

const response = await fetch(endpoint, {
  method: 'POST',
  body: form,
});

const text = await response.text();
console.log(text);
if (!response.ok) process.exit(response.status);
