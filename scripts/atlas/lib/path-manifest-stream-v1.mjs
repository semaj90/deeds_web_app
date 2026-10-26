import { createHash } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { Transform } from 'node:stream';

export function openPathManifestStream(path, workspace) {
  const source = createReadStream(path);
  const compression = workspace.pathManifestStorage?.compression ?? 'none';
  if (compression === 'gzip') return source.pipe(createGunzip());
  if (compression === 'none') return source;
  source.destroy();
  throw new Error('PATH_MANIFEST_COMPRESSION_UNSUPPORTED');
}

export async function verifyPathManifestArtifact(path, workspace) {
  const storage = workspace.pathManifestStorage;
  const compression = storage?.compression ?? 'none';
  if (compression !== 'none' && compression !== 'gzip') {
    throw new Error('PATH_MANIFEST_COMPRESSION_UNSUPPORTED');
  }
  const storedHash = createHash('sha256');
  const contentHash = createHash('sha256');
  let contentBytes = 0;
  const storedTap = new Transform({
    transform(chunk, encoding, callback) {
      storedHash.update(chunk);
      callback(null, chunk);
    },
  });
  const source = createReadStream(path);
  const storedStream = source.pipe(storedTap);
  const contentStream = compression === 'gzip' ? storedStream.pipe(createGunzip()) : storedStream;
  for await (const chunk of contentStream) {
    contentHash.update(chunk);
    contentBytes += chunk.length;
  }
  const storedBytes = statSync(path).size;
  const storedSha256 = storedHash.digest('hex');
  const contentSha256 = contentHash.digest('hex');
  if (contentSha256 !== workspace.pathManifestSha256) {
    throw new Error('PATH_MANIFEST_CHECKSUM_INVALID');
  }
  if (storage && (storedBytes !== storage.storedBytes || storedSha256 !== storage.storedSha256
    || contentBytes !== storage.uncompressedBytes)) {
    throw new Error('PATH_MANIFEST_STORAGE_CHECKSUM_INVALID');
  }
  return { compression, storedBytes, contentBytes, storedSha256, contentSha256 };
}
