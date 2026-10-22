/**
 * Read-time checksum gate for offline Arrow IPC artifacts (capability #20, M13).
 *
 * The descriptor carries the expected SHA-256 of the artifact bytes. The reader hashes the whole
 * file and refuses it on any mismatch. There is no partial read and no fallback.
 * Pure function: reads one file, writes nothing.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

const SHA256_HEX = /^[a-f0-9]{64}$/;

/**
 * @param {string} filePath
 * @param {string} expectedSha256 lowercase hex, from the RPC descriptor
 * @returns {Promise<{ ok: true, sha256: string, bytes: number } | { ok: false, reason: string, sha256?: string }>}
 */
export async function verifyArtifactChecksum(filePath, expectedSha256) {
  if (typeof expectedSha256 !== 'string' || !SHA256_HEX.test(expectedSha256)) {
    return { ok: false, reason: 'DESCRIPTOR_SHA256_INVALID' };
  }
  const hash = createHash('sha256');
  let bytes = 0;
  try {
    await new Promise((resolve, reject) => {
      const stream = createReadStream(filePath);
      stream.on('data', (chunk) => { bytes += chunk.length; hash.update(chunk); });
      stream.on('error', reject);
      stream.on('end', resolve);
    });
  } catch (err) {
    return { ok: false, reason: `ARTIFACT_UNREADABLE:${err.code ?? 'ERROR'}` };
  }
  const sha256 = hash.digest('hex');
  if (sha256 !== expectedSha256) {
    return { ok: false, reason: 'CHECKSUM_MISMATCH', sha256 };
  }
  return { ok: true, sha256, bytes };
}
