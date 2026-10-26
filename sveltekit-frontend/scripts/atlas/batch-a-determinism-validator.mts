import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checksumBatchASnapshotV1, parseBatchASnapshotV1, validateBatchASnapshotV1 } from './lib/batch-a-validation-v1.mjs';

export function runBatchAReplayValidationV1(args: string[]): number {
  try {
    if (args.length !== 4 || args[0] !== '--first' || args[2] !== '--second' || !args[1] || !args[3]) {
      throw new Error('Usage: batch:a:validate -- --first <snapshot.json> --second <independent-snapshot.json>');
    }
    const firstPath = path.resolve(args[1]);
    const secondPath = path.resolve(args[3]);
    const firstStat = statSync(firstPath);
    const secondStat = statSync(secondPath);
    if ((firstStat.dev === secondStat.dev && firstStat.ino === secondStat.ino)
      || !firstStat.isFile() || !secondStat.isFile() || firstStat.size > 64 * 1024 * 1024 || secondStat.size > 64 * 1024 * 1024) {
      throw new Error('TWO_DISTINCT_BOUNDED_SNAPSHOT_FILES_REQUIRED');
    }
    const first = parseBatchASnapshotV1(JSON.parse(readFileSync(firstPath, 'utf8')));
    const second = parseBatchASnapshotV1(JSON.parse(readFileSync(secondPath, 'utf8')));
    const gates = validateBatchASnapshotV1(first, second);
    const pass = gates.every(result => result.pass);
    console.log(JSON.stringify({
      schema: 'atlas.batch-a.replay-validation.v1',
      status: pass ? 'PASS' : 'BLOCKED',
      firstChecksum: checksumBatchASnapshotV1(first),
      secondChecksum: checksumBatchASnapshotV1(second),
      canonicalAuthority: false,
      writesPerformed: false,
      gates,
    }, null, 2));
    return pass ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({ status: 'INVALID_INPUT', writesPerformed: false, error: error instanceof Error ? error.message : String(error) }));
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = runBatchAReplayValidationV1(process.argv.slice(2));
}
