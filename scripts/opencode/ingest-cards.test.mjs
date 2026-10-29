import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scriptPath = fileURLToPath(new URL('./ingest-cards.mjs', import.meta.url));

test('apply appends ingest notes to active instruction files, not .bak files', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'ingest-cards-'));
  const cardDirectory = path.join(fixtureRoot, '.opencode', 'cards');
  const activeInstructions = path.join(fixtureRoot, 'AGENTS.md');
  const backupInstructions = path.join(fixtureRoot, 'AGENTS.md.bak');
  const backupContents = 'historical instructions';

  try {
    await mkdir(cardDirectory, { recursive: true });
    await writeFile(path.join(cardDirectory, 'card.json'), JSON.stringify({ id: 'fixture' }));
    await writeFile(activeInstructions, 'active instructions');
    await writeFile(backupInstructions, backupContents);

    execFileSync(process.execPath, [scriptPath, '--apply'], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      timeout: 10_000,
    });

    assert.match(await readFile(activeInstructions, 'utf8'), /<!-- ingest:/);
    assert.equal(await readFile(backupInstructions, 'utf8'), backupContents);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
