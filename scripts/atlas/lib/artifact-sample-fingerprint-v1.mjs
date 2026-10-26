import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';

export async function fileSampleFingerprintV1(filePath, entry) {
  const sampleSize = Math.min(entry.sizeBytes, 4096);
  const handle = await open(filePath, 'r');
  try {
    const before = await handle.stat({ bigint: true });
    if (before.size !== BigInt(entry.sizeBytes) || before.dev.toString() !== String(entry.dev)
      || before.ino.toString() !== String(entry.ino) || before.mtimeNs.toString() !== String(entry.mtimeNs)
      || before.ctimeNs.toString() !== String(entry.ctimeNs)) throw new Error('SAMPLE_FILE_METADATA_CHANGED');
    const first = Buffer.alloc(sampleSize);
    const firstRead = await handle.read(first, 0, sampleSize, 0);
    const tailSize = Math.min(sampleSize, Math.max(0, entry.sizeBytes - firstRead.bytesRead));
    const tail = Buffer.alloc(tailSize);
    const tailRead = tailSize
      ? await handle.read(tail, 0, tailSize, Math.max(firstRead.bytesRead, entry.sizeBytes - tailSize))
      : { bytesRead: 0 };
    const hash = createHash('sha256');
    hash.update(String(entry.sizeBytes));
    hash.update(first.subarray(0, firstRead.bytesRead));
    hash.update(tail.subarray(0, tailRead.bytesRead));
    const after = await handle.stat({ bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error('SAMPLE_FILE_CHANGED_DURING_READ');
    return {
      fingerprint: hash.digest('hex'),
      bytesRead: firstRead.bytesRead + tailRead.bytesRead,
      complete: firstRead.bytesRead === sampleSize && tailRead.bytesRead === tailSize,
    };
  } finally {
    await handle.close();
  }
}
