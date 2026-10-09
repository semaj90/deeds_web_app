import crypto from 'node:crypto';

export function reconstructAstGrepNominationIdV1({ sourceRef, sourceRevision, kind, name, startByte, endByte }) {
  const keyMaterial = JSON.stringify({
    sourceRef: String(sourceRef).replaceAll('\\', '/').normalize('NFC'),
    sourceRevision: String(sourceRevision),
    kind: String(kind).toLowerCase(),
    name: String(name).normalize('NFC'),
    startByte: Number(startByte),
    endByte: Number(endByte),
  });
  const digest = crypto.createHash('sha256').update(keyMaterial, 'utf8').digest('hex');
  return `ast-grep-nomination:${digest.slice(0, 40)}`;
}
