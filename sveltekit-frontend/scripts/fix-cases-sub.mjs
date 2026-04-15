import fs from 'fs';

const file = 'tests/cases-sub-routes.spec.ts';
let content = fs.readFileSync(file, 'utf8');

// List of exact test names that need mockDbRows.push
const testsToFix = [
  "creates connection on success",
  "returns 400 for invalid personId",
  "links person to case on success",
  "unlinks person from case",
  "returns no-op when no evidence found",
  "returns 400 for missing summary",
  "returns reasoning chain on success",
  "returns 500 on chain generation failure",
  "returns 400 for empty messages",
  "saves chat messages on success",
  "saves canvas state on success",
  "returns null when no canvas state exists"
];

let count = 0;
for (const testName of testsToFix) {
  const needle = `it('${testName}', async () => {`;
  const idx = content.indexOf(needle);
  if (idx === -1) {
    console.log(`NOT FOUND: ${testName}`);
    continue;
  }
  const insertPos = idx + needle.length;
  // Check if already has mockDbRows.push right after
  const nextChunk = content.substring(insertPos, insertPos + 100);
  if (nextChunk.includes('mockDbRows.push')) {
    console.log(`SKIP (already has push): ${testName}`);
    continue;
  }
  content = content.substring(0, insertPos) +
    `\n\t\tmockDbRows.push({ id: TEST_CASE_ID });` +
    content.substring(insertPos);
  count++;
  console.log(`FIXED: ${testName}`);
}

fs.writeFileSync(file, content);
console.log(`\nPatched ${count} tests`);
