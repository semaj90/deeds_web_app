/** Explicit per-file hash checks; receives bytes from an approved caller, never fetches weights. */
export interface EdgeArtifactCheck {
  expectedSha256: string;
  actualSha256?: string;
  verdict: 'PASS' | 'FAIL' | 'NOT_PROVEN';
  reason: string;
}
export async function verifyEdgeArtifact(data: ArrayBuffer, expectedSha256?: string): Promise<EdgeArtifactCheck> {
  if (!expectedSha256 || !/^[a-f0-9]{64}$/i.test(expectedSha256)) {
    return { expectedSha256: expectedSha256 ?? '', verdict: 'NOT_PROVEN', reason: 'Pinned SHA256 required before admission' };
  }
  if (!globalThis.crypto?.subtle) return { expectedSha256, verdict: 'NOT_PROVEN', reason: 'WebCrypto unavailable' };
  const digest = await crypto.subtle.digest('SHA-256', data);
  const actualSha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  return { expectedSha256, actualSha256, verdict: actualSha256 === expectedSha256.toLowerCase() ? 'PASS' : 'FAIL', reason: 'SHA256 comparison only; tokenizer/runtime compatibility is separate' };
}
// TODO: Stream/chunk verification for multi-GiB weights to avoid duplicating model bytes in browser memory.
// TODO: Add trusted provenance and GGUF/ONNX/.litertlm format-specific parsing.
